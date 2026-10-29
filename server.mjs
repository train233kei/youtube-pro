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
 * ⚡ jsDelivr CDN を経由してGitHubの最新HTTPプロキシリストを取得する関数
 */
async function getFreeProxyFromCDN() {
  try {
    // ProxyScrapeが5分おきに自動更新しているGitHubリポジトリをjsDelivr CDN経由で安全に読み込む
    const cdnUrl = 'https://jsdelivr.net';
    const res = await axios.get(cdnUrl, { timeout: 4000 });
    
    // 改行で分割して有効なIPの配列を作成
    const proxies = res.data.split('\n').map(p => p.trim()).filter(p => p !== '');
    
    if (proxies.length > 0) {
      // 取得したリストからランダムに1つ選択
      const randomIndex = Math.floor(Math.random() * proxies.length);
      const proxy = proxies[randomIndex];
      return `http://${proxy}`;
    }
  } catch (err) {
    console.log('[Proxy] jsDelivr経由でのプロキシ取得に失敗しました。ローカルIPを使用します。:', err.message);
  }
  return null;
}

/**
 * 🔍 API: YouTube キーワード検索
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: '検索キーワードが必要です' });

  const proxyUrl = await getFreeProxyFromCDN();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Search] jsDelivrプールから使用: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    options.fetch = (url, init) => fetch(url, { ...init, agent });
  } else {
    console.log('[Proxy Search] プロキシなし（ローカルIP）で接続します');
  }

  try {
    const yt = await Innertube.create(options);
    const searchResults = await yt.search(query, { type: 'video' });
    
    const videos = (searchResults.videos || []).map(video => {
      let thumbnailUrl = '';
      if (video.thumbnails && video.thumbnails.length > 0) {
        thumbnailUrl = video.thumbnails[0].url || video.thumbnails.url;
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
    res.status(500).json({ error: `検索に失敗しました。原因: ${error.message}` });
  }
});

/**
 * 🎬 API: 動画情報 ＆ ストリームURL取得
 */
app.get('/api/video/:id', async (req, res) => {
  const videoId = req.params.id;
  const proxyUrl = await getFreeProxyFromCDN();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Video] jsDelivrプールから使用: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    options.fetch = (url, init) => fetch(url, { ...init, agent });
  } else {
    console.log('[Proxy Video] プロキシなし（ローカルIP）で接続します');
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
    res.status(500).json({ error: `動画の取得に失敗しました。原因: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
