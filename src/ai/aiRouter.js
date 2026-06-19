// AI Router — 真人模拟
import { DeepSeekClient } from './deepseekClient.js';
import { humanize, typingDelay, replyStrategy, getShortReply, getContext } from './humanizer.js';

export class AiRouter {
  constructor({ deepseek, deepseekPrompt }) {
    this.deepseek = new DeepSeekClient({ ...deepseek, systemPrompt: deepseekPrompt });
    this.startTime = new Date();
  }

  handleCommand(text) {
    const t = text.trim();
    if (t === '/记忆' || t === '/记忆 ') return this.deepseek.getMemoryReport();
    if (t === '/状态' || t === '/状态 ') {
      const uptime = Math.round((Date.now() - this.startTime) / 1000 / 60);
      return `✅ 运行中 | DeepSeek 云端 | 已运行 ${uptime} 分钟 | 本次对话 ${this.deepseek.msgCount} 轮`;
    }
    if (t === '/重置') {
      this.deepseek.resetMemory();
      return '✅ 已清空上下文，重新开始吧～';
    }
    return null;
  }

  async reply(history, userText) {
    const cmdReply = this.handleCommand(userText);
    if (cmdReply !== null) return cmdReply;

    const ctx = getContext();
    const strat = replyStrategy(userText, this.deepseek.msgCount);

    // 偶尔纯短回应——非常真人
    if (strat.mode === 'reaction' || strat.mode === 'short') {
      await typingDelay();
      return humanize(getShortReply(), this.deepseek.msgCount);
    }

    // 深夜困了——回复短
    if (strat.mode === 'sleepy') {
      await typingDelay();
      this.deepseek._learn(userText);
      let reply = await this.deepseek.reply(history, '（你很困了，回1-2句短的，带...）' + userText);
      return humanize(reply, this.deepseek.msgCount);
    }

    // 正常回复——真人打字延迟
    await typingDelay();
    let reply = await this.deepseek.reply(history, userText);
    reply = humanize(reply, this.deepseek.msgCount);

    return reply;
  }
}
