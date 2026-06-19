// AI Router — DeepSeek API
import { DeepSeekClient } from './deepseekClient.js';

export class AiRouter {
  constructor({ deepseek, deepseekPrompt }) {
    this.deepseek = new DeepSeekClient({ ...deepseek, systemPrompt: deepseekPrompt });
  }

  async handleCommand(text) {
    const t = text.trim();
    if (t === '/style') return '当前：默认';
    return null;
  }

  async reply(history, userText) {
    const cmdReply = await this.handleCommand(userText);
    if (cmdReply !== null) return cmdReply;
    return await this.deepseek.reply(history, userText);
  }
}
