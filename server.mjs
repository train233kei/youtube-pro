import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Innertube } from 'youtubei.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

/**
 * 🔒 静的に定義された無料プロキシプール
 * ※ getaddrinfoエラーを避けるため、コード内に直接持たせます。
 * (無料プロキシは生存期間が短いため、動かなくなったらここのIPを定期的に書き換えるか、
 *  環境変数 PROXY_LIST にカンマ区切りでRenderの管理画面から投入できるようにします)
 */
const STATIC_PROXIES = [
  'http://43.200.77.123:80',    // サンプルIP (実際にお使いの際は、公開されている最新のHTTP/HTTPSプロキシに差し替えてください)
  'http://13.208.55.22:3128',
  'http://15.152.112.45:8080'
];

function getStaticProxy() {
  // Renderの環境変数に PROXY_LIST が設定されていればそれを優先
  const envProxies = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [];
  const pool = envProxies.length > 0 ? envProxies : STATIC_PROXIES;
  
  if (pool.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex].trim();
}

/**
 * 🔍 API: YouTube キーワード検索
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: '検索キーワードが必要です' });

  const proxyUrl = getStaticProxy();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Search] 静的プールから使用: ${proxyUrl}`);
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
    res.status(500).json({ error: `検索に失敗しました。原因: ${error.message}` });
  }
});

/**
 * 🎬 API: 動画情報 ＆ ストリームURL取得
 */
app.get('/api/video/:id', async (req, res) => {
  const videoId = req.params.id;
  const proxyUrl = getStaticProxy();
  let options = {};

  if (proxyUrl) {
    console.log(`[Proxy Video] 静的プールから使用: ${proxyUrl}`);
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
