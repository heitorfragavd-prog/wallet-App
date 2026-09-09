const http = require('http');

let stats = {
  openaiCalls: 0,
  divipayCalls: 0,
  eyemobileCalls: 0,
  lastOpenaiPayload: null,
  openaiMode: 'success', // 'success' | 'error' | 'timeout'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(stats));
  }

  if (url.pathname === '/reset' && req.method === 'POST') {
    stats = { 
      openaiCalls: 0, 
      divipayCalls: 0, 
      eyemobileCalls: 0, 
      lastOpenaiPayload: null,
      openaiMode: 'success'
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, stats }));
  }

  if (url.pathname === '/mock/openai/mode' && req.method === 'POST') {
    let modeBody = '';
    req.on('data', chunk => { modeBody += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(modeBody);
        if (parsed.mode) {
          stats.openaiMode = parsed.mode;
        }
      } catch (e) {
        // ignore
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, openaiMode: stats.openaiMode }));
    });
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    // 1. OpenAI Chat Completions Mock
    if (url.pathname.includes('/v1/chat/completions')) {
      stats.openaiCalls++;
      try {
        stats.lastOpenaiPayload = JSON.parse(body);
      } catch (e) {
        stats.lastOpenaiPayload = body;
      }

      const simulateMode = url.searchParams.get('simulate') || req.headers['x-simulate'] || stats.openaiMode;

      if (simulateMode === 'timeout') {
        // Simular timeout nao respondendo de imediato
        return setTimeout(() => {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Gateway Timeout' } }));
        }, 3000);
      }

      if (simulateMode === 'error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: { 
            message: 'OpenAI Internal Error',
            type: 'server_error',
            code: 'service_unavailable'
          } 
        }));
      }

      const mockAiContent = JSON.stringify({
        categoria: 'alimentacao',
        confianca: 0.95,
        justificativa: 'Compra de suprimentos alimenticios'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        id: 'chatcmpl-mock-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: mockAiContent,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          total_tokens: 50,
        },
      }));
    }

    // 2. Divipay Mock
    if (url.pathname.includes('/divipay') || url.pathname.includes('/v1/auth/token')) {
      stats.divipayCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        access_token: 'mock-divipay-access-token-12345',
        token_type: 'bearer',
        expires_in: 3600,
        scope: 'read write',
      }));
    }

    // 3. Eyemobile Mock
    if (url.pathname.includes('/eyemobile')) {
      stats.eyemobileCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'success',
        data: { synced: true, items: [] },
      }));
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

const PORT = process.env.MOCK_PORT || 18080;
server.listen(PORT, () => {
  console.log(`[Mock External Providers] Rodando na porta ${PORT}`);
});
