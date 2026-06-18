// 企业微信 API client — access token management + message sending
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a valid access_token, reusing cached one if not expired.
 * https://developer.work.weixin.qq.com/document/10013
 */
async function getAccessToken(config) {
  if (cachedToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedToken;
  }
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.corpId}&corpsecret=${config.agentSecret}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WeCom gettoken HTTP ${res.status}`);
  const json = await res.json();
  if (json.errcode !== 0) {
    throw new Error(`WeCom gettoken error [${json.errcode}]: ${json.errmsg}`);
  }
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in || 7200) * 1000;
  return cachedToken;
}

/**
 * Flush the cached token (call on 40014/invalid token errors).
 */
function flushToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/**
 * Send a text message to a user.
 * https://developer.work.weixin.qq.com/document/10012
 */
async function sendText(config, userId, content) {
  const token = await getAccessToken(config);
  const body = JSON.stringify({
    touser: userId,
    msgtype: 'text',
    agentid: config.agentId,
    text: { content }
  });
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  const json = await res.json();
  if (json.errcode !== 0) {
    console.error(`WeCom send error [${json.errcode}]: ${json.errmsg}`);
    // Token expired — flush and allow one retry at caller level
    if (json.errcode === 40014 || json.errcode === 42001) {
      flushToken();
    }
  }
  return json;
}

export const WeComAPI = { getAccessToken, sendText, flushToken };
