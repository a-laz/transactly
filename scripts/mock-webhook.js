const http = require('http');
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    console.log('---- webhook ----');
    console.log('path:', req.url);
    console.log('statusMode:', process.env.FAIL === '1' ? 'FAIL(500)' : 'OK(200)');
    console.log('x-webhook-id:', req.headers['x-webhook-id']);
    console.log('x-webhook-event:', req.headers['x-webhook-event']);
    console.log('x-webhook-timestamp:', req.headers['x-webhook-timestamp']);
    console.log('x-webhook-alg:', req.headers['x-webhook-alg']);
    console.log('x-webhook-signature:', req.headers['x-webhook-signature']);
    console.log('body:', body);
    res.writeHead(process.env.FAIL === '1' ? 500 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: process.env.FAIL !== '1' }));
  });
});
server.listen(4000, () => console.log('Mock webhook listening on http://localhost:4000/webhook'));
