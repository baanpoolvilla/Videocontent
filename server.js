const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const clients = new Set();

// Live-reload SSE endpoint
app.get('/__reload', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcastReload() {
  for (const c of clients) c.write('data: reload\n\n');
}

// Watch .html/.css/.js files in root dir
fs.watch(path.join(__dirname), { recursive: false }, (_evt, filename) => {
  if (filename && /\.(html|css|js)$/.test(filename) && filename !== 'server.js') {
    console.log(`\n🔄  ${filename} changed — reloading...`);
    broadcastReload();
  }
});

// Inject reload snippet into HTML responses
app.get('*.html', (req, res) => {
  const file = path.join(__dirname, req.path);
  try {
    let html = fs.readFileSync(file, 'utf8');
    const snippet = `<script>
(function(){
  const es=new EventSource('/__reload');
  es.onmessage=e=>{ if(e.data==='reload') location.reload(); };
  es.onerror=()=>setTimeout(()=>location.reload(),1500);
})();
</script>`;
    html = html.replace('</body>', snippet + '\n</body>');
    res.type('html').send(html);
  } catch {
    res.status(404).send('File not found: ' + req.path);
  }
});

// Serve everything else statically
app.use(express.static(__dirname));

// Default redirect to the mockup
app.get('/', (_req, res) => {
  res.redirect('/ai_content_studio_premium.html');
});

app.listen(PORT, () => {
  console.log('\n✦  Content Studio Dev Server');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://localhost:${PORT}/ai_content_studio_premium.html`);
  console.log('\n   แก้ไข HTML แล้วบราวเซอร์โหลดเองอัตโนมัติ 🚀\n');
});
