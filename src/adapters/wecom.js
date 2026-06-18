// 企业微信 adapter — receives webhooks, decrypts, chats, replies via API
import { createServer } from 'node:http';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({ ignoreAttributes: false });
import { WeComCrypto } from '../wecom/crypto.js';
import { WeComAPI } from '../wecom/api.js';

/**
 * Parse the XML envelope from WeCom POST body.
 * Returns { toUserName, encrypt, agentId } or null.
 */
function parseEncryptedXML(body) {
  const parsed = xmlParser.parse(body, { ignoreAttributes: false });
  if (!parsed.xml) return null;
  return {
    toUserName: parsed.xml.ToUserName || '',
    encrypt: parsed.xml.Encrypt || '',
    agentId: parsed.xml.AgentID || ''
  };
}

/**
 * Parse the decrypted message XML.
 * Returns { fromUserName, msgType, content, msgId } or null.
 */
function parseMessageXML(xml) {
  const parsed = xmlParser.parse(xml, { ignoreAttributes: false });
  if (!parsed.xml) return null;
  return {
    fromUserName: parsed.xml.FromUserName || '',
    toUserName: parsed.xml.ToUserName || '',
    msgType: parsed.xml.MsgType || '',
    content: parsed.xml.Content || '',
    msgId: parsed.xml.MsgId || '',
    agentId: parsed.xml.AgentID || ''
  };
}

/**
 * Read the raw body from an incoming HTTP request.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function runWecomAdapter({ chatService, config }) {
  const { token, encodingAESKey, corpId, agentId, agentSecret } = config.wecom;
  const wecomCrypto = new WeComCrypto(token, encodingAESKey, corpId);

  // Build the API config object for convenient passing
  const apiConfig = { corpId, agentId, agentSecret };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      // GET — URL verification (企业微信 will call this when setting up the callback)
      if (req.method === 'GET' && url.pathname === '/wecom') {
        const msgSignature = url.searchParams.get('msg_signature');
        const timestamp = url.searchParams.get('timestamp');
        const nonce = url.searchParams.get('nonce');
        const echostr = url.searchParams.get('echostr');

        if (!msgSignature || !timestamp || !nonce || !echostr) {
          res.writeHead(400);
          res.end('Missing params');
          return;
        }

        const decrypted = wecomCrypto.verifyURL(msgSignature, timestamp, nonce, echostr);
        if (!decrypted) {
          res.writeHead(403);
          res.end('Signature verification failed');
          return;
        }
        console.log('WeCom URL verification succeeded');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(decrypted);
        return;
      }

      // POST — incoming message
      if (req.method === 'POST' && url.pathname === '/wecom') {
        const msgSignature = url.searchParams.get('msg_signature');
        const timestamp = url.searchParams.get('timestamp');
        const nonce = url.searchParams.get('nonce');

        const body = await readBody(req);

        // Parse encrypted envelope
        const envelope = parseEncryptedXML(body);
        if (!envelope || !envelope.encrypt) {
          res.writeHead(200);
          res.end('ok'); // ACK anyway so WeCom doesn't retry
          return;
        }

        // Verify signature
        const sig = wecomCrypto.signature(timestamp || '', nonce || '', envelope.encrypt);
        if (msgSignature && sig !== msgSignature) {
          console.error('WeCom message signature mismatch');
          res.writeHead(200);
          res.end('ok');
          return;
        }

        // Decrypt
        let decrypted;
        try {
          decrypted = wecomCrypto.decrypt(envelope.encrypt);
        } catch (e) {
          console.error('WeCom decrypt failed:', e.message);
          res.writeHead(200);
          res.end('ok');
          return;
        }

        // Parse inner message
        const msg = parseMessageXML(decrypted.message);
        if (!msg || msg.msgType !== 'text' || !msg.content) {
          res.writeHead(200);
          res.end('ok');
          return;
        }

        console.log(`[WeCom] ${msg.fromUserName}: ${msg.content}`);

        // Always ACK quickly; WeCom has a 5-second timeout on passive replies.
        // We send the actual reply via the active API call.
        res.writeHead(200);
        res.end('ok');

        // Get AI reply
        const conversationId = `wecom:${msg.fromUserName}`;
        const replyText = await chatService.handleText({
          conversationId,
          text: msg.content
        });

        if (replyText) {
          // WeCom text limit is 2048 bytes; split if needed
          const maxLen = 2000;
          let text = replyText;
          while (text.length > 0) {
            let chunk = text.slice(0, maxLen);
            text = text.slice(maxLen);
            const result = await WeComAPI.sendText(apiConfig, msg.fromUserName, chunk);
            // If token expired, flush and retry once
            if (result && (result.errcode === 40014 || result.errcode === 42001)) {
              await WeComAPI.sendText(apiConfig, msg.fromUserName, chunk);
            }
            // Small delay between chunks
            if (text.length > 0) await new Promise(r => setTimeout(r, 500));
          }
        }
        return;
      }

      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', adapter: 'wecom' }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (e) {
      console.error('WeCom server error:', e);
      if (!res.headersSent) {
        res.writeHead(200);
        res.end('ok');
      }
    }
  });

  const port = config.port || 3000;
  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`🏢 企业微信 Bot 已启动`);
      console.log(`   Webhook URL: http://<your-public-url>:${port}/wecom`);
      console.log(`   请在企业微信管理后台配置回调 URL`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
