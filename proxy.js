const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');

const app = express();

// Enable CORS to allow requests from http://localhost:8080
app.use(cors());

// Create an Axios instance that ignores SSL certificate errors
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Ignore invalid SSL certificates
  })
});

// Proxy endpoint for streams
app.get('/proxy-stream', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send('Missing URL parameter');
  }

  try {
    const response = await axiosInstance.get(url, { responseType: 'stream' });
    res.set('Access-Control-Allow-Origin', '*');
    res.set(response.headers);
    response.data.pipe(res);
  } catch (error) {
    console.error('Proxy stream error:', error.message);
    res.status(500).send(`Stream proxy error: ${error.message}`);
  }
});

// Proxy endpoint for M3U playlist
app.get('/proxy-m3u', async (req, res) => {
  try {
    const response = await axiosInstance.get('https://raw.githubusercontent.com/luongz/iptv-jp/refs/heads/main/jp.m3u');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'text/plain');
    res.send(response.data);
  } catch (error) {
    console.error('M3U proxy error:', error.message);
    res.status(500).send('M3U proxy error');
  }
});

const port = 3000;
app.listen(port, () => console.log(`Proxy server running on http://localhost:${port}`));
