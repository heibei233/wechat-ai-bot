import { createServer } from 'node:http';
import QRCode from 'qrcode';

let currentQR = null;
let botStatus = 'initializing'; // initializing | waiting | logged-in | logged-out
let loginUser = null;
let loginTime = null;

export function updateQR(qrcode) {
  currentQR = qrcode;
  botStatus = 'waiting';
}

export function updateLogin(user) {
  currentQR = null;
  botStatus = 'logged-in';
  loginUser = user;
  loginTime = new Date().toISOString();
}

export function updateLogout(user) {
  currentQR = null;
  botStatus = 'logged-out';
  loginUser = null;
  loginTime = null;
}

function getHTML() {
  const qrSection = currentQR
    ? `<div id="qr-container">
         <img src="/qr.png?t=${Date.now()}" alt="QR Code" width="256" height="256" />
         <p style="color:#ff6600;font-weight:bold;margin-top:8px;">请用微信扫码登录</p>
       </div>`
    : '';

  const statusInfo = (() => {
    switch (botStatus) {
      case 'initializing':
        return '<p>⏳ 正在初始化...</p>';
      case 'waiting':
        return '<p>📱 等待扫码中...</p>';
      case 'logged-in':
        return `<p>✅ 已登录: <strong>${loginUser || ''}</strong> — ${loginTime ? new Date(loginTime).toLocaleString('zh-CN') : ''}</p>`;
      case 'logged-out':
        return '<p>❌ 已掉线，3 秒后自动重连...</p>';
      default:
        return '';
    }
  })();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WeChat AI Bot - 扫码登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      background: #16213e;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 480px;
      width: 90%;
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #4ecca3; }
    .subtitle { color: #888; margin-bottom: 24px; font-size: 14px; }
    #qr-container {
      background: white;
      padding: 20px;
      border-radius: 12px;
      margin: 20px auto;
      display: inline-block;
    }
    #qr-container img { display: block; }
    .status { font-size: 16px; margin-top: 16px; }
    .footer { margin-top: 24px; font-size: 12px; color: #555; }
    .footer a { color: #4ecca3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 WeChat AI Bot</h1>
    <p class="subtitle">个人微信 AI 聊天机器人</p>
    ${qrSection}
    <div class="status" id="status">${statusInfo}</div>
    ${currentQR ? '<p style="font-size:13px;color:#888;margin-top:12px;">🔄 二维码过期后会自动刷新</p>' : ''}
    <p class="footer">
      Powered by <a href="https://wechaty.js.org" target="_blank">Wechaty</a> + DeepSeek
    </p>
  </div>
  <script>
    // Auto-refresh page every 5s so new QR appears without manual reload
    setInterval(() => {
      fetch('/status')
        .then(r => r.json())
        .then(data => {
          const statusEl = document.getElementById('status');
          const needReload =
            (data.status === 'waiting' && !document.querySelector('#qr-container')) ||
            (data.status === 'logged-in' && !statusEl.textContent.includes(data.user || '')) ||
            (data.status === 'logged-out' && !statusEl.textContent.includes('掉线'));
          if (needReload) location.reload();
        })
        .catch(() => {});
    }, 5000);
  </script>
</body>
</html>`;
}

export async function startQRServer(port = 3000) {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getHTML());
        return;
      }

      if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: botStatus,
          user: loginUser,
          loginTime
        }));
        return;
      }

      if (req.url === '/qr-data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ qr: currentQR }));
        return;
      }

      // fallback: generate QR as PNG directly
      if (req.url === '/qr.png' && currentQR) {
        try {
          const png = await QRCode.toBuffer(currentQR, { width: 256, margin: 2 });
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(png);
          return;
        } catch (e) {
          // fall through to 404
        }
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (e) {
      console.error('QR server error:', e);
      res.writeHead(500);
      res.end('Internal error');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`📱 QR 扫码页面: http://localhost:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
