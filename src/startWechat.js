process.env.BOT_ADAPTER = 'wechaty';

// Start QR code web server (port from env or default 3000)
const PORT = Number(process.env.BOT_PORT) || 3000;
const { startQRServer } = await import('./web/qrServer.js');
await startQRServer(PORT);

await import('./index.js');
