// 真人微信聊天模拟 — 越来越像人
const now = () => new Date();

/** 获取当前语境 */
export function getContext() {
  const h = now().getHours();
  if (h >= 23 || h <= 1) return { mood: '困', timeName: '深夜' };
  if (h <= 6) return { mood: '迷糊', timeName: '凌晨' };
  if (h <= 9) return { mood: '刚醒', timeName: '早上' };
  if (h <= 12) return { mood: '正常', timeName: '上午' };
  if (h <= 14) return { mood: '饿', timeName: '中午' };
  if (h <= 17) return { mood: '懒', timeName: '下午' };
  if (h <= 20) return { mood: '放松', timeName: '傍晚' };
  return { mood: '想他', timeName: '晚上' };
}

/** 初始反应词——收到消息的第一句话，像真人看到消息的反应 */
const OPENERS = [
  '', '', '', '', '', '', // 60% 概率不前置
  '嗯嗯', '哈哈哈', '噗', '啊', '我刚要找你',
  '听到了', '我刚才在', '等一下下我', '你先别急',
  '哈哈哈你是不是', '我刚洗完澡', '刚才差点睡着',
];

/** 句尾收束——真人微信不会写长句 */
const TRAIL_OFFS = [
  '', '', '', '', '', '', '',
  '...', '...', '..',
  'hhh', 'hh',
  '算了不说了',
  '你懂的',
  '反正就是',
];

/** 口癖词缀 */
const MOUTHFILL = ['嗯', '啊', '就是', '那个', '其实', '反正', '怎么说呢'];

/** 短句回应——当用户发了普通消息时，偶尔只回短句 */
const SHORT_REACTS = [
  '嗯嗯', 'hhh', '好嘛', '知道了啦', '那你呢', '我也是', '呜呜', '真的假的', '你别逗我', '然后呢',
];

/** 打错字（偶尔不纠正） */
const RAW_TYPOS = [
  { from: '不好意思', to: '不好意西' },
  { from: '知道了', to: '知道了啦' }, // not a typo but casual
  { from: '那个', to: '那个个' },
  { from: '等一下', to: '等一哈' },
  { from: '怎么', to: '咋' },
  { from: '什么', to: '啥' },
];

// ============ 核心处理 ============

export function humanize(text, conversationLength) {
  let result = text;

  // 1. 掐掉 AI 味儿——去掉长篇大论和括号动作超过一行的
  result = clampLength(result);

  // 2. 偶尔前置反应词
  if (Math.random() < 0.25 && result.length > 3) {
    const o = OPENERS[Math.floor(Math.random() * OPENERS.length)];
    if (o && !result.startsWith('(')) {
      result = o + '，' + result.replace(/^[\s，,]+/, '');
    }
  }

  // 3. 句尾偶尔加自然拖尾
  if (Math.random() < 0.2 && result.length > 5 && result.length < 60) {
    const t = TRAIL_OFFS[Math.floor(Math.random() * TRAIL_OFFS.length)];
    if (t && !result.endsWith('~') && !result.endsWith('...')) {
      result = result + t;
    }
  }

  // 4. 把正式的词换成口语
  result = makeColloquial(result);

  // 5. 偶尔打错字不改
  if (Math.random() < 0.04) {
    const t = RAW_TYPOS[Math.floor(Math.random() * RAW_TYPOS.length)];
    result = result.replace(new RegExp(t.from, 'g'), t.to);
  }

  // 6. 亲昵语气——聊久了像熟人
  if (conversationLength > 8 && Math.random() < 0.15) {
    result = result.replace(/我/g, (m, i, s) => {
      if (i === 0) return m;
      if (s[i - 1] === '的') return '我'; // 我的不要改
      return Math.random() < 0.5 ? '人家' : m;
    });
  }

  // 7. 深夜语气不一样
  const ctx = getContext();
  if (ctx.mood === '困' && Math.random() < 0.3 && !result.includes('...')) {
    result = result.replace(/[。！]$/, '...');
  }

  return result;
}

/** 限制长度——真人微信不发论文 */
function clampLength(text) {
  // 如果超过100字，只取前两句
  if (text.length > 100) {
    const sentences = text.split(/[。！\n]/);
    if (sentences.length > 3) {
      return sentences.slice(0, 3).join('。').replace(/。$/g, '') + '...';
    }
  }
  // 去掉多余换行
  if (text.split('\n').length > 3) {
    return text.split('\n').slice(0, 3).join('\n');
  }
  return text;
}

/** 口语化替换 */
function makeColloquial(text) {
  const map = {
    '非常': '超',
    '十分': '特别',
    '也许': '可能',
    '立刻': '马上',
    '十分': '很',
    '现在': '这会儿',
    '突然': '一下子',
    '觉得': '感觉',
    '应该': '好像',
    '希望': '好想',
  };
  let r = text;
  for (const [formal, casual] of Object.entries(map)) {
    if (Math.random() < 0.4) r = r.replace(new RegExp(formal, 'g'), casual);
  }
  return r;
}

// ============ 回复策略 ============

/** 决定回复方式——真人不会每条都正经回 */
export function replyStrategy(userText, conversationLength) {
  const len = userText.trim().length;
  const r = Math.random();

  // 对方发短消息 — 30% 概率只回短句
  if (len < 10 && r < 0.3) {
    return { mode: 'short' };
  }

  // 聊了很久— 15% 概率只回表情式文字
  if (conversationLength > 15 && r < 0.15) {
    return { mode: 'reaction' };
  }

  // 深夜 — 40% 概率回得更短更像困了
  const h = now().getHours();
  if ((h >= 23 || h <= 2) && r < 0.4) {
    return { mode: 'sleepy' };
  }

  return { mode: 'normal' };
}

/** 生成短回应 */
export function getShortReply() {
  const reacts = [
    '嗯嗯', 'hhh', '好嘛', '知道了啦', '那你呢',
    '我也是', '呜呜', '真的假的', '你别逗我', '然后呢',
    '好吧...', '我想想', '有点困了', '嘻嘻', '你怎么这么会',
    '刚在发呆', '嗯 你说', '听着呢', '我刚刚没看到', '切~',
    '有道理', '才不信', '你好烦', '好啦好啦', '放心啦',
  ];
  return reacts[Math.floor(Math.random() * reacts.length)];
}

/** 获取动态延迟（秒）*/
export function typingDelaySeconds() {
  const ctx = getContext();
  // 平时 1-6 秒，深夜/刚醒 2-10 秒
  const base = (ctx.mood === '困' || ctx.mood === '刚醒' || ctx.mood === '迷糊')
    ? 2 : 1;
  const range = (ctx.mood === '困' || ctx.mood === '刚醒' || ctx.mood === '迷糊')
    ? 8 : 5;
  return base + Math.random() * range;
}

/** async 版延迟 */
export function typingDelay() {
  return new Promise(r => setTimeout(r, typingDelaySeconds() * 1000));
}
