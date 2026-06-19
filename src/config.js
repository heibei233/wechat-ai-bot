import 'dotenv/config';

function splitList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  adapter: process.env.BOT_ADAPTER || 'console',
  port: Number(process.env.PORT || process.env.BOT_PORT || 3000),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    model: process.env.OLLAMA_MODEL || 'deepseek-r1:32b'
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseURL: 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'sao10k/l3-euryale-70b'
  },
  bot: {
    systemPrompt:
      process.env.BOT_SYSTEM_PROMPT ||
      '你是一个微信聊天助手。回复自然、简洁、有帮助，像真人聊天一样。',
    maxTurns: Number(process.env.BOT_MAX_TURNS || 10),
    allowPrivateContacts: splitList(process.env.ALLOW_PRIVATE_CONTACTS),
    allowRooms: splitList(process.env.ALLOW_ROOMS)
  },
  wecom: {
    corpId: process.env.WECOM_CORP_ID || '',
    agentId: Number(process.env.WECOM_AGENT_ID) || 0,
    agentSecret: process.env.WECOM_AGENT_SECRET || '',
    token: process.env.WECOM_TOKEN || '',
    encodingAESKey: process.env.WECOM_ENCODING_AES_KEY || ''
  },
  kefu: {
    corpId: process.env.WECOM_CORP_ID || '',
    secret: process.env.WECOM_KEFU_SECRET || process.env.WECOM_AGENT_SECRET || '',
    agentSecret: process.env.WECOM_AGENT_SECRET || '',
    openKfId: process.env.WECOM_KEFU_OPEN_KFID || '',
    token: process.env.WECOM_KEFU_TOKEN || '',
    encodingAESKey: process.env.WECOM_KEFU_AES_KEY || ''
  },
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED === 'true',
    targetUserId: process.env.SCHEDULER_USER_ID || '',
    // Comma-separated cron+prompt pairs: "0 9 * * *|早安问候,0 22 * * *|晚安"
    jobsRaw: process.env.SCHEDULER_JOBS || ''
  }
};

export function validateConfig() {
  if (!config.deepseek.apiKey) {
    throw new Error('Missing DEEPSEEK_API_KEY. Copy .env.example to .env and fill it in.');
  }

  if (!['console', 'wechaty', 'wecom', 'kefu'].includes(config.adapter)) {
    throw new Error(`Unsupported BOT_ADAPTER "${config.adapter}". Use "console", "wechaty", "wecom", or "kefu".`);
  }

  if (config.adapter === 'wecom') {
    const missing = [];
    if (!config.wecom.corpId) missing.push('WECOM_CORP_ID');
    if (!config.wecom.agentSecret) missing.push('WECOM_AGENT_SECRET');
    if (!config.wecom.token) missing.push('WECOM_TOKEN');
    if (!config.wecom.encodingAESKey) missing.push('WECOM_ENCODING_AES_KEY');
    if (missing.length) {
      throw new Error(`WeCom adapter requires: ${missing.join(', ')}. Get them from the 企业微信 admin console.`);
    }
  }

  if (config.adapter === 'kefu') {
    const missing = [];
    if (!config.kefu.corpId) missing.push('WECOM_CORP_ID');
    if (!config.kefu.secret) missing.push('WECOM_AGENT_SECRET');
    if (!config.kefu.openKfId) missing.push('WECOM_KEFU_OPEN_KFID');
    if (!config.kefu.token) missing.push('WECOM_KEFU_TOKEN');
    if (!config.kefu.encodingAESKey) missing.push('WECOM_KEFU_AES_KEY');
    if (missing.length) {
      throw new Error(`Kefu adapter requires: ${missing.join(', ')}. Get them from 企业微信管理后台 → 微信客服.`);
    }
  }
}
