// 微信客服 adapter — personal WeChat ↔ bot via sync_msg polling
import { createServer } from 'node:http';
import { WeComCrypto } from '../wecom/crypto.js';
import { sendKefuMessage, syncKefuMessages, listKefuAccounts } from '../wecom/kefuApi.js';
import { startScheduler } from '../wecom/scheduler.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function runKefuAdapter({ chatService, config }) {
  const { token, encodingAESKey, corpId, openKfId, secret, agentSecret } = config.kefu;
  const crypto = new WeComCrypto(token, encodingAESKey, corpId);
  const apiConfig = { corpId, secret, agentSecret, openKfId };

  // Track processed message IDs and sync cursor
  const processedMsgs = new Set();
  let cursor = '';

  // Resolve the real open_kfid from account/list API
  let resolvedOpenKfId = openKfId;
  async function resolveAccount() {
    const accounts = await listKefuAccounts(apiConfig);
    if (accounts.length > 0) {
      resolvedOpenKfId = accounts[0].open_kfid;
      console.log(`[Kefu] Using open_kfid: ${resolvedOpenKfId} (${accounts[0].name})`);
    } else {
      console.log(`[Kefu] No accounts from API, using config open_kfid: ${openKfId}`);
    }
  }
  await resolveAccount();
  // Update apiConfig with the real open_kfid
  apiConfig.openKfId = resolvedOpenKfId;

  // Rate limiting: track last reply time per user (min 5s between replies)
  const lastReply = new Map();
  // Track pending replies per user — only reply to latest message in a batch
  const latestMsg = new Map();

  // Polling loop — fetch messages every 10 seconds
  async function pollMessages() {
    try {
      const result = await syncKefuMessages(apiConfig, resolvedOpenKfId, cursor);
      if (!result || !result.msg_list) {
        // Process any pending messages
        await flushPendingReplies();
        return;
      }

      for (const msg of result.msg_list) {
        if (processedMsgs.has(msg.msgid)) continue;
        processedMsgs.add(msg.msgid);

        if (msg.origin !== 3 || msg.msgtype !== 'text') continue;
        const content = msg.text?.content;
        if (!content) continue;

        const userId = msg.external_userid;
        console.log(`[Kefu] ${userId}: ${content}`);

        // Only reply to the latest message per user in this batch
        latestMsg.set(userId, { content, sendTime: msg.send_time || Date.now() });
      }

      // Flush latest-message replies with rate limit
      await flushPendingReplies();

      if (result.next_cursor) cursor = result.next_cursor;
      if (processedMsgs.size > 10000) processedMsgs.clear();
    } catch (e) {
      console.error('[Kefu] Poll error:', e.message);
    }
    setTimeout(pollMessages, 10000);
  }

  async function flushPendingReplies() {
    const entries = [...latestMsg.entries()];
    latestMsg.clear();

    for (const [userId, msg] of entries) {
      // Minimum 5 second cooldown between replies to same user
      const lastTime = lastReply.get(userId) || 0;
      const cooldown = Math.max(0, 5000 - (Date.now() - lastTime));
      if (cooldown > 0) {
        await new Promise(r => setTimeout(r, cooldown));
      }

      const replyText = await chatService.handleText({
        conversationId: `kefu:${userId}`,
        text: msg.content
      });

      if (replyText) {
        console.log(`[Kefu] Reply to ${userId}: ${replyText.slice(0, 100)}...`);
        lastReply.set(userId, Date.now());
        const maxLen = 2000;
        let text = replyText;
        while (text.length > 0) {
          const chunk = text.slice(0, maxLen);
          text = text.slice(maxLen);
          const r = await sendKefuMessage(apiConfig, userId, chunk);
          if (r && (r.errcode === 40014 || r.errcode === 42001)) {
            await sendKefuMessage(apiConfig, userId, chunk);
          }
          if (r && r.errcode === 95001) {
            // Send limit reached — drop remaining chunks and backoff
            console.error('[Kefu] Send limit reached, dropping remaining chunks');
            break;
          }
          if (text.length > 0) await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  // Start polling
  console.log('[Kefu] Starting message polling (every 10s)...');
  pollMessages();

  // Start scheduler for proactive messages
  console.log('[Kefu] Scheduler config:', JSON.stringify({ enabled: config.scheduler?.enabled, userId: config.scheduler?.targetUserId, jobsLen: config.scheduler?.jobsRaw?.length }));
  if (config.scheduler?.enabled && config.scheduler.targetUserId) {
    const { jobsRaw } = config.scheduler;
    // Parse jobs: "cron|prompt,RANDOM/60-180|prompt"
    const schedules = jobsRaw.split(',').map(item => {
      const parts = item.trim().split('|');
      if (parts.length < 2) return null;

      let cron = parts[0].trim();
      const prompt = parts.slice(1).join('|').trim();

      // Check for RANDOM/min-max format
      if (cron.startsWith('RANDOM')) {
        const m = cron.match(/^RANDOM\/(\d+)-(\d+)$/);
        return {
          cron: 'RANDOM',
          interval: m ? [parseInt(m[1]), parseInt(m[2])] : [60, 180],
          prompt
        };
      }

      return { cron, prompt };
    }).filter(Boolean);

    if (schedules.length > 0) {
      console.log(`[Scheduler] Enabled with ${schedules.length} jobs:`);
      schedules.forEach((s, i) => console.log(`  ${i + 1}. ${s.cron} → ${s.prompt.slice(0, 40)}...`));
      startScheduler({
        apiConfig,
        chatService,
        userId: config.scheduler.targetUserId,
        schedules
      });
    }
  }

  // Still run the callback server for URL verification and events
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      // GET — URL verification
      if (req.method === 'GET' && url.pathname === '/kefu') {
        const sig = url.searchParams.get('msg_signature');
        const ts = url.searchParams.get('timestamp');
        const nonce = url.searchParams.get('nonce');
        const echostr = url.searchParams.get('echostr');

        const decrypted = crypto.verifyURL(sig, ts, nonce, echostr);
        if (!decrypted) { res.writeHead(403); res.end('fail'); return; }
        console.log('[Kefu] URL verified');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(decrypted);
        return;
      }

      // POST — event notification (ACK only, actual messages are polled)
      if (req.method === 'POST' && url.pathname === '/kefu') {
        res.writeHead(200); res.end('ok');
        return;
      }

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', adapter: 'kefu' }));
        return;
      }

      res.writeHead(404); res.end('Not found');
    } catch (e) {
      console.error('[Kefu] Error:', e);
      if (!res.headersSent) { res.writeHead(200); res.end('ok'); }
    }
  });

  const port = config.port || 3000;
  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`💬 微信客服 Bot 已启动 (polling mode)`);
      console.log(`   Polling: kf/sync_msg for ${openKfId} every 10s`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
