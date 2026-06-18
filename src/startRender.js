// Render production entry point
import 'dotenv/config';
import { createServer } from 'node:http';
import { DeepSeekClient } from './ai/deepseekClient.js';
import { ChatService } from './bot/chatService.js';
import { ChatMemory } from './memory/chatMemory.js';
import { sendKefuMessage, listKefuAccounts } from './wecom/kefuApi.js';
import { WeComCrypto } from './wecom/crypto.js';
import { getWeather } from './wecom/weather.js';

const port = Number(process.env.PORT) || 3000;
const systemPrompt = process.env.BOT_SYSTEM_PROMPT || '';
const targetUserId = process.env.SCHEDULER_USER_ID || '';

const aiClient = new DeepSeekClient({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  systemPrompt
});

const memory = new ChatMemory({ maxTurns: Number(process.env.BOT_MAX_TURNS) || 10 });
const chatService = new ChatService({ aiClient, memory });

const apiConfig = {
  corpId: process.env.WECOM_CORP_ID || '',
  secret: process.env.WECOM_KEFU_SECRET || process.env.WECOM_AGENT_SECRET || '',
  agentSecret: process.env.WECOM_AGENT_SECRET || '',
  openKfId: process.env.WECOM_KEFU_OPEN_KFID || 'kfc3f05d14e417b3beb'
};

// Resolve real open_kfid from API
async function initOpenKfid() {
  try {
    const accounts = await listKefuAccounts(apiConfig);
    if (accounts.length > 0) {
      apiConfig.openKfId = accounts[0].open_kfid;
      console.log(`[Kefu] open_kfid: ${apiConfig.openKfId} (${accounts[0].name})`);
      return;
    }
  } catch (e) { console.error('[Kefu] Account list failed:', e.message); }
  if (!apiConfig.openKfId) apiConfig.openKfId = 'kfc3f05d14e417b3beb';
  console.log(`[Kefu] Using env open_kfid: ${apiConfig.openKfId}`);
}

await initOpenKfid();

// Crypto for callback
const kefuCrypto = new WeComCrypto(
  process.env.WECOM_KEFU_TOKEN || '',
  process.env.WECOM_KEFU_AES_KEY || '',
  process.env.WECOM_CORP_ID || ''
);

const lastReply = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleMessage(userId, content) {
  // Rate limit: max 1 reply per 3s per user
  const last = lastReply.get(userId) || 0;
  if (Date.now() - last < 3000) return;
  lastReply.set(userId, Date.now());

  const replyText = await chatService.handleText({
    conversationId: `kefu:${userId}`,
    text: content
  });
  if (!replyText) return;

  console.log(`[Reply] ${userId}: ${replyText.slice(0, 80)}`);
  const r = await sendKefuMessage(apiConfig, userId, replyText);
  if (r?.errcode !== 0) {
    console.error(`[Reply] Failed [${r?.errcode}]: ${r?.errmsg}`);
  }
}

// === Scheduler ===
let weatherCache = { time: 0, data: null };

async function fetchWeather() {
  if (Date.now() - weatherCache.time < 30 * 60000 && weatherCache.data) return weatherCache.data;
  const w = await getWeather('Chengdu');
  if (w) { weatherCache.data = w; weatherCache.time = Date.now(); }
  return w || weatherCache.data || '暂无天气数据';
}

function parseCron(e) { const p = e.trim().split(/\s+/); return { min: p[0], hour: p[1], day: p[2], mon: p[3], wday: p[4] }; }
function match(f, v) { if (f === '*') return true; if (f.startsWith('*/')) return v % parseInt(f.slice(2)) === 0; return parseInt(f) === v; }
function shouldFire(c) { const n = new Date(), x = parseCron(c); return match(x.min, n.getMinutes()) && match(x.hour, n.getHours()) && match(x.day, n.getDate()) && match(x.mon, n.getMonth() + 1) && match(x.wday, n.getDay()); }

const jobsRaw = process.env.SCHEDULER_JOBS || '';
const jobs = jobsRaw.split(',').map(item => {
  const [cron, ...rest] = item.trim().split('|');
  if (!cron || !rest.length) return null;
  let c = cron.trim(), p = rest.join('|').trim();
  if (c.startsWith('RANDOM')) {
    const m = c.match(/^RANDOM\/(\d+)-(\d+)$/);
    return { cron: 'RANDOM', interval: m ? [parseInt(m[1]), parseInt(m[2])] : [60, 180], prompt: p };
  }
  return { cron: c, prompt: p };
}).filter(Boolean);

const fireMap = new Map();
let lastSend = 0;

async function runScheduler() {
  if (!targetUserId || !jobs.length) return;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (job.cron === 'RANDOM') {
      const [min] = job.interval;
      if (Math.random() < 30 / (min * 120) && Date.now() - lastSend > min * 60000) {
        lastSend = Date.now();
        const parts = job.prompt.split(';').map(s => s.trim()).filter(Boolean);
        let prompt = parts[Math.floor(Math.random() * parts.length)];
        if (prompt.includes('{weather}')) prompt = prompt.replace(/\{weather\}/g, await fetchWeather());
        const t = await chatService.handleText({ conversationId: 'sched', text: prompt });
        if (t) await sendKefuMessage(apiConfig, targetUserId, t);
      }
    } else if (shouldFire(job.cron)) {
      const now = new Date(), key = `${i}:${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
      if (fireMap.get(i) === key) continue;
      fireMap.set(i, key);
      const parts = job.prompt.split(';').map(s => s.trim()).filter(Boolean);
      let prompt = parts[Math.floor(Math.random() * parts.length)];
      if (prompt.includes('{weather}')) prompt = prompt.replace(/\{weather\}/g, await fetchWeather());
      const t = await chatService.handleText({ conversationId: 'sched', text: prompt });
      if (t) { await sendKefuMessage(apiConfig, targetUserId, t); lastSend = Date.now(); }
    }
  }
}

if (process.env.SCHEDULER_ENABLED === 'true') {
  console.log(`[Scheduler] ${jobs.length} jobs`);
  setInterval(runScheduler, 30000);
  runScheduler();
}

// === HTTP Server ===
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (u.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // GET — URL verification
    if (req.method === 'GET' && u.pathname === '/kefu') {
      const sig = u.searchParams.get('msg_signature') || '';
      const ts = u.searchParams.get('timestamp') || '';
      const nonce = u.searchParams.get('nonce') || '';
      const echostr = u.searchParams.get('echostr') || '';
      const decrypted = kefuCrypto.verifyURL(sig, ts, nonce, echostr);
      if (decrypted) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(decrypted);
      } else {
        res.writeHead(403);
        res.end('fail');
      }
      return;
    }

    // POST — incoming event notification (kf_msg_or_event contains Token for sync_msg)
    if (req.method === 'POST' && u.pathname === '/kefu') {
      const sig = u.searchParams.get('msg_signature') || '';
      const ts = u.searchParams.get('timestamp') || '';
      const nonce = u.searchParams.get('nonce') || '';

      const body = await readBody(req);

      // Parse encrypted XML
      const em = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
      const encrypted = em ? em[1] : (() => { try { return JSON.parse(body).encrypt || JSON.parse(body).Encrypt; } catch { return null; } })();

      // ACK immediately regardless
      res.writeHead(200); res.end('ok');

      if (!encrypted) return;

      // Decrypt
      let decrypted;
      try { decrypted = kefuCrypto.decrypt(encrypted); } catch (e) { console.error('[Kefu] Decrypt failed:', e.message); return; }

      const xml = decrypted.message;
      console.log('[Kefu] Event XML:', xml.slice(0, 200));

      // Parse event
      const ev = (xml.match(/<Event><!\[CDATA\[(.*?)\]\]><\/Event>/) || [])[1] || '';
      const token = (xml.match(/<Token><!\[CDATA\[(.*?)\]\]><\/Token>/) || [])[1] || '';
      const kfId = (xml.match(/<OpenKfId><!\[CDATA\[(.*?)\]\]><\/OpenKfId>/) || [])[1] || '';

      if (ev === 'kf_msg_or_event' && token) {
        console.log('[Kefu] kf_msg_or_event received, syncing...');
        // Use the Token to pull actual messages via sync_msg
        try {
          const { syncKefuMessages: syncMsg } = await import('./wecom/kefuApi.js');
          const result = await syncMsg(apiConfig, kfId || apiConfig.openKfId, '', token); // token from callback
          if (result?.msg_list) {
            for (const msg of result.msg_list) {
              if (msg.origin !== 3 || msg.msgtype !== 'text') continue;
              const content = msg.text?.content;
              const userId = msg.external_userid;
              if (!content || !userId) continue;
              console.log(`[Kefu] ${userId}: ${content}`);
              await handleMessage(userId, content);
            }
          }
        } catch (e) {
          console.error('[Kefu] sync_msg failed:', e.message);
        }
      }
      return;
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error('[Kefu] Error:', e);
    if (!res.headersSent) { res.writeHead(500); res.end('err'); }
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Bot running on port ${port}`);
});
