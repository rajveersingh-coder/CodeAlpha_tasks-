require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
  res.send('NexBot proxy running');
});

app.post('/api/message', async (req, res) => {
  // Use GROQ_API_KEY from environment
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key in server environment (GROQ_API_KEY)' });

  const { model, max_tokens, system, messages } = req.body || {};
  // Require an upstream URL to be configured (GROQ_API_URL)
  const upstreamUrl = process.env.GROQ_API_URL;
  if (!upstreamUrl) return res.status(500).json({ error: 'Missing upstream URL. Set GROQ_API_URL in your .env to your provider endpoint.' });

  // Allow selecting which auth header to send. Some providers expect
  // `Authorization: Bearer <key>`, others expect `x-api-key: <key>`.
  const authMethod = (process.env.GROQ_API_AUTH_METHOD || 'x-api-key').toLowerCase();
  let headers = { 'Content-Type': 'application/json' };
  if (authMethod === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (authMethod === 'x-api-key' || authMethod === 'x-api') {
    headers['x-api-key'] = apiKey;
  } else {
    // default to x-api-key to be safe
    headers['x-api-key'] = apiKey;
  }
  console.log('Using auth header method:', authMethod);

  // Allow overriding HTTP method for upstream (e.g., GET for some GROQ endpoints)
  const upstreamMethod = (process.env.GROQ_API_METHOD || 'POST').toUpperCase();

  try {
    let response;

    if (upstreamMethod === 'POST') {
      response = await axios.post(upstreamUrl, { model, max_tokens, system, messages }, { headers });
    } else if (upstreamMethod === 'GET') {
      // Map request body to query params for GET
      response = await axios.get(upstreamUrl, { headers, params: { model, max_tokens, system, messages: JSON.stringify(messages) } });
    } else {
      return res.status(500).json({ error: `Unsupported GROQ_API_METHOD: ${upstreamMethod}` });
    }

    // Attempt to extract text from upstream response (best-effort)
    let replyText = '';
    if (response.data && response.data.content && response.data.content[0] && response.data.content[0].text) {
      replyText = response.data.content[0].text;
    } else if (typeof response.data === 'string') {
      replyText = response.data;
    } else {
      replyText = JSON.stringify(response.data);
    }

    res.json({ reply: replyText });
  } catch (err) {
    // Provide richer error info for debugging 405s and other upstream issues
    console.error('API proxy error:', err && err.message ? err.message : err);
    const upstreamStatus = err.response && err.response.status;
    const upstreamBody = err.response && err.response.data;

    const payload = {
      error: 'Upstream request failed',
      upstreamStatus: upstreamStatus || null,
      upstreamBody: upstreamBody || (err.message || String(err))
    };

    // If 405 (Method Not Allowed), include hint about GROQ_API_METHOD
    if (upstreamStatus === 405) {
      payload.hint = 'Upstream returned 405 Method Not Allowed. Try setting GROQ_API_METHOD=GET or adjust GROQ_API_URL to the correct endpoint.';
    }

    res.status(502).json(payload);
  }
});

app.listen(PORT, () => {
  console.log(`NexBot proxy listening on http://localhost:${PORT}`);
});
