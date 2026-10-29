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

// public ディレクトリ内の静的ファイル（index.htmlなど）を配信
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 無料プロキシリストAPIからプロキシを1つ取得する関数
 */
async function getFreeProxy() {
  try {
    const res = await axios.get('https://pubproxy.com');
    if (res.data && res.data.data && res.data.data.length > 0) {
      const proxy = res.data.data;
      return `http://${proxy.ip}:${proxy.port}`;
    }
  } catch (err) {
    console.log('[Proxy] 無料プロキシの取得に失敗しました。ローカルIPを使用します。:', err.message);
  }
  return null;
}

/**
 * 🔍 API: YouTube キーワード検索
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: '検索キーワードが必要です' });
  }

  const proxyUrl = await getFreeProxy();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Search] 使用中: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    options.fetch = (url, init) => fetch(url, { ...init, agent });
  } else {
    console.log('[Proxy Search] プロキシなしで検索リクエストを行います');
  }

  try {
    const yt = await Innertube.create(options);
    const searchResults = await yt.search(query, { type: 'video' });
    
    // 安全に動画情報を抽出（構文エラーを修正し、オブジェクト構造の変化に対応）
    const videos = (searchResults.videos || []).map(video => {
      // サムネイルURLを安全に取得
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
    console.error('[Search Error]', error);
    res.status(500).json({ error: 'YouTubeの検索処理に失敗しました。' });
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
  } else {
    console.log('[Proxy Video] プロキシなしで動画情報をリクエストします');
  }

  try {
    const yt = await Innertube.create(options);
    const videoInfo = await yt.getInfo(videoId);

    // 再生可能なストリーム形式を選択
    const format = videoInfo.chooseFormat({ type: 'video+audio', quality: 'best' });
    
    res.json({
      title: videoInfo.basic_info.title,
      description: videoInfo.basic_info.description,
      streamUrl: format ? format.url : null
    });
  } catch (error) {
    console.error('[Video Error]', error);
    res.status(500).json({ error: '動画データの取得に失敗しました。' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
