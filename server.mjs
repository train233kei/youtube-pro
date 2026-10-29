import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Innertube } from 'youtubei.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

/**
 * 【強化版】無料プロキシリストをGitHubのパブリックソースから取得する関数
 */
async function getFreeProxy() {
  try {
    // 稼働率の高いパブリックなプロキシリスト（テキスト形式）を数種類から取得
    const res = await axios.get('https://githubusercontent.com', { timeout: 3000 });
    const proxies = res.data.split('\n').filter(p => p.trim() !== '');
    
    if (proxies.length > 0) {
      // 取得したリストからランダムに1つ選ぶ
      const randomIndex = Math.floor(Math.random() * proxies.length);
      const proxy = proxies[randomIndex].trim();
      return `http://${proxy}`;
    }
  } catch (err) {
    console.log('[Proxy] 外部プロキシリストの取得に失敗しました。ローカルIPを使用します。:', err.message);
  }
  return null;
}

/**
 * 🔍 API: YouTube キーワード検索
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: '検索キーワードが必要です' });

  const proxyUrl = await getFreeProxy();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Search] 使用中: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    options.fetch = (url, init) => fetch(url, { ...init, agent });
  }

  try {
    const yt = await Innertube.create(options);
    const searchResults = await yt.search(query, { type: 'video' });
    
    const videos = (searchResults.videos || []).map(video => {
      let thumbnailUrl = '';
      if (video.thumbnails && video.thumbnails.length > 0) {
        thumbnailUrl = video.thumbnails[0].url;
      } else if (video.thumbnail && video.thumbnail.url) {
        thumbnailUrl = video.thumbnail.url;
      }

      return {
        id: video.id || '',
        title: video.title?.toString() || 'タイトルなし',
        thumbnail: thumbnailUrl,
        author: video.author?.name || '不明'
      };
    });

    res.json({ videos });
  } catch (error) {
    console.error('[Search Error]', error.message);
    res.status(500).json({ error: 'YouTubeの検索に失敗しました。ライブラリの更新を待つか、プロキシを変更してください。' });
  }
});

/**
 * 🎬 API: 動画情報 ＆ ストリームURL取得
 */
app.get('/api/video/:id', async (req, res) => {
  const videoId = req.params.id;
  const proxyUrl = await getFreeProxy();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Video] 使用中: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    options.fetch = (url, init) => fetch(url, { ...init, agent });
  }

  try {
    const yt = await Innertube.create(options);
    const videoInfo = await yt.getInfo(videoId);
    const format = videoInfo.chooseFormat({ type: 'video+audio', quality: 'best' });
    
    res.json({
      title: videoInfo.basic_info.title,
      description: videoInfo.basic_info.description,
      streamUrl: format ? format.url : null
    });
  } catch (error) {
    console.error('[Video Error]', error.message);
    res.status(500).json({ error: '動画データの取得に失敗しました。' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
