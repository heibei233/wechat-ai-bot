import OpenAI from 'openai';
import { humanize, typingDelay } from './humanizer.js';

export class DeepSeekClient {
  constructor({ apiKey, baseURL, model, systemPrompt }) {
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.client = new OpenAI({ apiKey, baseURL });
    this.msgCount = 0;
    this.usedPhrases = [];
    this.learnedName = null;
    this.likes = [];
  }

  _learn(userText) {
    this.msgCount++;
    const m1 = userText.match(/叫我?([一-龥]{1,4})/);
    if (m1) this.learnedName = m1[1];
    const m2 = userText.match(/喜欢(?:你)?([一-龥]{2,6})/);
    if (m2 && !this.likes.includes(m2[1])) this.likes.push(m2[1]);
  }

  _buildPrompt() {
    let extra = '';
    if (this.learnedName) extra += `他喜欢叫你${this.learnedName}。`;
    if (this.likes.length) extra += `他喜欢：${this.likes.join('、')}。`;
    if (this.msgCount > 5) extra += `你们已经很熟了，像老朋友。`;
    extra += `每次都要换个说法，别重复。`;
    return (this.systemPrompt + ' ' + extra).trim();
  }

  getMemoryReport() {
    const parts = [];
    if (this.learnedName) parts.push(`🤙 称呼：${this.learnedName}`);
    if (this.likes.length) parts.push(`💕 喜好：${this.likes.join('、')}`);
    if (this.msgCount > 0) parts.push(`💬 本次对话：${this.msgCount} 轮`);
    if (!parts.length) return '我还不太了解你呢...多跟我聊聊天好不好？';
    return '📝 我记住的：\n' + parts.join('\n');
  }

  resetMemory() {
    this.msgCount = 0;
    this.usedPhrases = [];
    this.learnedName = null;
    this.likes = [];
  }

  async reply(history, userText) {
    this._learn(userText);

    const messages = [
      { role: 'system', content: this._buildPrompt() },
      ...history,
      { role: 'user', content: userText }
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model, messages, temperature: 0.85, top_p: 0.95
    });

    let content = completion.choices?.[0]?.message?.content?.trim() || '';
    if (this.usedPhrases.includes(content.slice(0, 20))) {
      content = '（轻声笑起来）' + content;
    }
    this.usedPhrases.push(content.slice(0, 20));
    if (this.usedPhrases.length > 50) this.usedPhrases.shift();
    return content;
  }

  setSystemPrompt(prompt) { this.systemPrompt = prompt; }
}
