const axios = require('axios');

const PLAYLIST_URL = 'https://raw.githubusercontent.com/luongz/iptv-jp/main/jp.m3u';
const API_KEY = 'nekostream-secure-key-2025'; // Hardcoded for simplicity; use environment variables in production

module.exports = async (req, res) => {
  const { url, type } = req.query;
  const providedApiKey = req.headers['x-api-key'] || req.query.apiKey;

  // Validate API key
  if (!providedApiKey || providedApiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  try {
    if (type === 'playlist') {
      // Fetch and rewrite the .m3u playlist
      const response = await axios.get(PLAYLIST_URL, {
        headers: { 'Accept': 'text/plain' }
      });
      let playlist = response.data;

      // Rewrite HTTP and HTTPS stream URLs to use the proxy
      playlist = playlist.replace(
        /(http(s)?:\/\/[^\s]+)/g,
        (match) => `/api/playlist-proxy?type=stream&url=${encodeURIComponent(match)}&apiKey=${encodeURIComponent(API_KEY)}`
      );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(playlist);
    } else if (type === 'stream' && url) {
      // Proxy the stream (e.g., .m3u8, .ts, .mp4)
      const response = await axios.get(url, {
        responseType: 'stream',
        headers: {
          'Accept': '*/*',
          'User-Agent': 'axios/1.6.7'
        }
      });

      res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      response.data.pipe(res);
    } else {
      res.status(400).json({ error: 'Invalid request. Specify type=playlist or type=stream with a URL' });
    }
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to proxy content',
      details: error.message
    });
  }
};
