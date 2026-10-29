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

// メモリ上に保持するプロキシプール
let cachedProxies = [];

/**
 * 🚀 【新機能】サーバー起動時、および定期的にバックグラウンドでプロキシリストを取得する関数
 * タイムアウトを15秒まで伸ばし、バックグラウンドで行うためユーザーを待たせません。
 */
async function refreshProxyPool() {
  try {
    console.log('[Proxy Pool] プロキシリストをjsDelivrからバックグラウンドで取得中...');
    const cdnUrl = 'https://jsdelivr.net';
    
    // タイムアウトを15秒（15000ms）に延長
    const res = await axios.get(cdnUrl, { timeout: 315000 });
    
    const proxies = res.data.split('\n').map(p => p.trim()).filter(p => p !== '');
    if (proxies.length > 0) {
      cachedProxies = proxies;
      console.log(`[Proxy Pool] 更新成功。現在 ${cachedProxies.length} 個のプロキシが利用可能です。`);
    }
  } catch (err) {
    console.error('[Proxy Pool] プロキシリストの更新に失敗しました:', err.message);
  }
}

// 1. サーバー起動時に一回リストを取得する
refreshProxyPool();

// 2. 15分ごとにバックグラウンドでプロキシリストを自動更新する
setInterval(refreshProxyPool, 15 * 60 * 1000);

/**
 * メモリ内のプールからランダムにプロキシを1つ返す関数（超高速・通信なし）
 */
function getProxyFromCache() {
  if (cachedProxies.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * cachedProxies.length);
  return `http://${cachedProxies[randomIndex]}`;
}

/**
 * 🔍 API: YouTube キーワード検索
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: '検索キーワードが必要です' });

  const proxyUrl = getProxyFromCache();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Search] メモリキャッシュから使用: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    options.fetch = (url, init) => fetch(url, { ...init, agent });
  } else {
    console.log('[Proxy Search] プロキシキャッシュが空のため、ローカルIPで接続します');
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
  const proxyUrl = getProxyFromCache();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Video] メモリキャッシュから使用: ${proxyUrl}`);
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
    res.status(500).json({ error: `動画の取得に失敗しました。原因: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
