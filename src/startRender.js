// Render production entry point — DeepSeek only (no Ollama on cloud)
import 'dotenv/config';
import { createServer } from 'node:http';
import { DeepSeekClient } from './ai/deepseekClient.js';
import { ChatService } from './bot/chatService.js';
import { ChatMemory } from './memory/chatMemory.js';
import { sendKefuMessage, syncKefuMessages, listKefuAccounts } from './wecom/kefuApi.js';
import { WeComCrypto } from './wecom/crypto.js';
import { getWeather } from './wecom/weather.js';

// === Config from env ===
const port = Number(process.env.PORT) || 3000;
const systemPrompt = process.env.BOT_SYSTEM_PROMPT || '';
const openKfId = process.env.WECOM_KEFU_OPEN_KFID || '';
const targetUserId = process.env.SCHEDULER_USER_ID || '';

// === AI Client ===
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
  openKfId
};

// === Kefu polling ===
const processedMsgs = new Set();
let cursor = '';
let resolvedOpenKfId = openKfId;
const lastReply = new Map();
const latestMsg = new Map();
let pollInterval = 10000;
let errorStreak = 0;

async function resolveAccount() {
  try {
    const accounts = await listKefuAccounts(apiConfig);
    if (accounts.length > 0) {
      resolvedOpenKfId = accounts[0].open_kfid;
      console.log(`[Kefu] open_kfid resolved from API: ${resolvedOpenKfId}`);
    }
  } catch (e) {
    console.error(`[Kefu] Account list API failed: ${e.message}`);
  }
  apiConfig.openKfId = resolvedOpenKfId;
  // Never fall back to the admin-console ID — it's a different thing and will fail
  if (!resolvedOpenKfId) {
    throw new Error('Failed to resolve open_kfid from API. Check Secret and IP whitelist.');
  }
}

async function pollMessages() {
  try {
    const result = await syncKefuMessages(apiConfig, resolvedOpenKfId, cursor);
    if (!result || !result.msg_list) return;

    for (const msg of result.msg_list) {
      if (processedMsgs.has(msg.msgid)) continue;
      processedMsgs.add(msg.msgid);
      if (msg.origin !== 3 || msg.msgtype !== 'text') continue;
      const content = msg.text?.content;
      if (!content) continue;
      const userId = msg.external_userid;
      console.log(`[Kefu] ${userId}: ${content}`);
      latestMsg.set(userId, { content });
    }

    // Reply to latest per user
    for (const [userId, m] of latestMsg) {
      if (!lastReply.has(userId) || Date.now() - lastReply.get(userId) > 5000) {
        const replyText = await chatService.handleText({
          conversationId: `kefu:${userId}`, text: m.content
        });
        if (replyText) {
          console.log(`[Kefu] Reply to ${userId}: ${replyText.slice(0, 80)}`);
          const r = await sendKefuMessage(apiConfig, userId, replyText);
          if (r?.errcode === 0) lastReply.set(userId, Date.now());
        }
      }
    }
    latestMsg.clear();

    if (result.next_cursor) cursor = result.next_cursor;
    if (processedMsgs.size > 10000) processedMsgs.clear();
    errorStreak = 0;
    pollInterval = Math.max(10000, pollInterval - 5000);
  } catch (e) {
    errorStreak++;
    console.error('[Kefu] Poll error:', e.message);
    // Rate limit or "used in wecom" — back off
    if (errorStreak > 3) pollInterval = Math.min(120000, pollInterval + 30000);
  }
  setTimeout(pollMessages, pollInterval);
}

// === Scheduler ===
let weatherCache = { time: 0, data: null };

async function fetchWeather() {
  if (Date.now() - weatherCache.time < 30 * 60000 && weatherCache.data) return weatherCache.data;
  const w = await getWeather('Chengdu');
  if (w) { weatherCache.data = w; weatherCache.time = Date.now(); }
  return w || weatherCache.data || '暂无天气数据';
}

function parseCron(expr) {
  const p = expr.trim().split(/\s+/);
  return { min: p[0], hour: p[1], day: p[2], mon: p[3], wday: p[4] };
}
function match(field, val) {
  if (field === '*') return true;
  if (field.startsWith('*/')) return val % parseInt(field.slice(2)) === 0;
  return parseInt(field) === val;
}
function shouldFire(cron) {
  const n = new Date(), c = parseCron(cron);
  return match(c.min, n.getMinutes()) && match(c.hour, n.getHours()) && match(c.day, n.getDate()) && match(c.mon, n.getMonth() + 1) && match(c.wday, n.getDay());
}

const jobsRaw = process.env.SCHEDULER_JOBS || '';
const jobs = jobsRaw.split(',').map(item => {
  const [cron, ...promptParts] = item.trim().split('|');
  if (!cron || !promptParts.length) return null;
  let c = cron.trim(), p = promptParts.join('|').trim();
  if (c.startsWith('RANDOM')) {
    const m = c.match(/^RANDOM\/(\d+)-(\d+)$/);
    return { cron: 'RANDOM', interval: m ? [parseInt(m[1]), parseInt(m[2])] : [60, 180], prompt: p };
  }
  return { cron: c, prompt: p };
}).filter(Boolean);

const lastFire = new Map();
let lastSend = 0;

async function checkScheduler() {
  if (!targetUserId) return;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (job.cron === 'RANDOM') {
      const [min] = job.interval;
      if (Math.random() < 30 / ((min * 60) * 2) && Date.now() - lastSend > min * 60000) {
        lastSend = Date.now();
        const parts = job.prompt.split(';').map(s => s.trim()).filter(Boolean);
        let prompt = parts[Math.floor(Math.random() * parts.length)];
        if (prompt.includes('{weather}')) prompt = prompt.replace(/\{weather\}/g, await fetchWeather());
        const aiText = await chatService.handleText({ conversationId: `sched:${targetUserId}`, text: prompt });
        if (aiText) {
          const r = await sendKefuMessage(apiConfig, targetUserId, aiText);
          console.log(`[Scheduler] Sent: ${aiText.slice(0, 60)}`);
        }
      }
    } else if (shouldFire(job.cron)) {
      const now = new Date();
      const key = `${i}:${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
      if (lastFire.get(i) === key) continue;
      lastFire.set(i, key);
      const parts = job.prompt.split(';').map(s => s.trim()).filter(Boolean);
      let prompt = parts[Math.floor(Math.random() * parts.length)];
      if (prompt.includes('{weather}')) prompt = prompt.replace(/\{weather\}/g, await fetchWeather());
      const aiText = await chatService.handleText({ conversationId: `sched:${targetUserId}`, text: prompt });
      if (aiText) {
        const r = await sendKefuMessage(apiConfig, targetUserId, aiText);
        if (r?.errcode === 0) lastSend = Date.now();
        console.log(`[Scheduler] Sent: ${aiText.slice(0, 60)}`);
      }
    }
  }
}

// === Start everything ===
await resolveAccount();

// Polling
pollMessages();

// Scheduler
if (process.env.SCHEDULER_ENABLED === 'true') {
  console.log(`[Scheduler] Enabled with ${jobs.length} jobs`);
  setInterval(checkScheduler, 30000);
  checkScheduler();
}

// HTTP server — kefu callback + health
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (u.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', adapter: 'kefu' }));
      return;
    }
    if (req.method === 'GET' && u.pathname === '/kefu') {
      const token = process.env.WECOM_KEFU_TOKEN || '';
      const aesKey = process.env.WECOM_KEFU_AES_KEY || '';
      const corpId = process.env.WECOM_CORP_ID || '';
      const crypto = new WeComCrypto(token, aesKey, corpId);
      const sig = u.searchParams.get('msg_signature') || '';
      const ts = u.searchParams.get('timestamp') || '';
      const nonce = u.searchParams.get('nonce') || '';
      const echostr = u.searchParams.get('echostr') || '';
      const decrypted = crypto.verifyURL(sig, ts, nonce, echostr);
      if (decrypted) {
        console.log('[Kefu] URL verified');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(decrypted);
      } else {
        console.log('[Kefu] URL verify failed');
        res.writeHead(403);
        res.end('fail');
      }
      return;
    }
    if (req.method === 'POST' && u.pathname === '/kefu') {
      res.writeHead(200);
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    if (!res.headersSent) { res.writeHead(500); res.end('Error'); }
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Render bot started on port ${port}`);
  console.log(`Health: /health, Kefu: /kefu`);
});
