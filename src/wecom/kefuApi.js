// 微信客服 API — send messages to WeChat users via customer service channel
// https://developer.work.weixin.qq.com/document/path/94670

let cachedToken = null;
let tokenExpiresAt = 0;
let cachedSecret = '';

async function getToken(config) {
  // Try kefu secret first, then agent secret
  const secret = config.secret || config.agentSecret;
  if (cachedToken && Date.now() < tokenExpiresAt - 300000 && cachedSecret === secret) return cachedToken;
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.corpId}&corpsecret=${secret}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.errcode !== 0) {
    // If kefu secret fails, try agent secret
    if (config.agentSecret && secret !== config.agentSecret) {
      console.log('[Kefu] Retrying with agent secret...');
      const url2 = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.corpId}&corpsecret=${config.agentSecret}`;
      const res2 = await fetch(url2);
      const json2 = await res2.json();
      if (json2.errcode !== 0) throw new Error(`gettoken [${json2.errcode}]: ${json2.errmsg}`);
      cachedToken = json2.access_token;
      tokenExpiresAt = Date.now() + (json2.expires_in || 7200) * 1000;
      cachedSecret = config.agentSecret;
      return cachedToken;
    }
    throw new Error(`gettoken [${json.errcode}]: ${json.errmsg}`);
  }
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in || 7200) * 1000;
  cachedSecret = secret;
  return cachedToken;
}

function flushToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/**
 * List KF accounts to get the real open_kfid.
 * https://developer.work.weixin.qq.com/document/path/94661
 */
export async function listKefuAccounts(config) {
  const token = await getToken(config);
  const body = JSON.stringify({});
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/kf/account/list?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  const json = await res.json();
  if (json.errcode !== 0) {
    console.error(`Kefu account/list error [${json.errcode}]: ${json.errmsg}`);
    return [];
  }
  console.log('[Kefu] Accounts:', JSON.stringify(json.account_list?.map(a => ({ name: a.name, open_kfid: a.open_kfid }))));
  return json.account_list || [];
}

/**
 * Send a text message to a WeChat user via customer service.
 */
export async function sendKefuMessage(config, externalUserId, content) {
  const token = await getToken(config);
  const body = JSON.stringify({
    touser: externalUserId,
    open_kfid: config.openKfId,
    msgtype: 'text',
    text: { content }
  });
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  const json = await res.json();
  if (json.errcode !== 0) {
    console.error(`Kefu send error [${json.errcode}]: ${json.errmsg}`);
    if (json.errcode === 40014 || json.errcode === 42001) flushToken();
  }
  return json;
}

/**
 * Poll for new messages from WeChat Customer Service.
 * https://developer.work.weixin.qq.com/document/path/94670#%E8%8E%B7%E5%8F%96%E6%B6%88%E6%81%AF
 */
export async function syncKefuMessages(config, openKfId, cursor = '', callbackToken = '') {
  const token = await getToken(config);
  const body = JSON.stringify({
    cursor,
    token: callbackToken || '',
    limit: 100,
    voice_format: 0,
    open_kfid: openKfId
  });
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  const json = await res.json();
  if (json.errcode !== 0) {
    console.error(`Kefu sync error [${json.errcode}]: ${json.errmsg}`);
    if (json.errcode === 40014 || json.errcode === 42001) flushToken();
    return { msg_list: [], next_cursor: cursor };
  }
  return json; // { errcode, errmsg, next_cursor, has_more, msg_list }
}
