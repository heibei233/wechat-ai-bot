// 用户画像 — 机器人自主学习，越来越了解你
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = 'data';
const PROFILE_FILE = resolve(DATA_DIR, 'user-profile.json');
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

export class UserProfile {
  constructor(userId) {
    this.userId = userId;
    this.facts = {};       // { '昵称': '宝宝', '喜欢': ['被叫老公', '温柔'], '讨厌': ['冷漠'] }
    this.phrases = new Set(); // 已使用的句子，避免重复
    this.conversationCount = 0;
    this.lastTopics = [];  // 最近聊了什么
    this._load();
  }

  _load() {
    try {
      if (existsSync(PROFILE_FILE)) {
        const data = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));
        if (data[this.userId]) {
          Object.assign(this, data[this.userId]);
          this.phrases = new Set(data[this.userId].phrases || []);
        }
        console.log(`[Profile] 已加载 ${this.userId} 的画像（${this.conversationCount} 次对话）`);
      }
    } catch {}
  }

  _save() {
    try {
      const data = existsSync(PROFILE_FILE) ? JSON.parse(readFileSync(PROFILE_FILE, 'utf8')) : {};
      data[this.userId] = {
        facts: this.facts,
        phrases: [...this.phrases].slice(-200), // cap at 200
        conversationCount: this.conversationCount,
        lastTopics: this.lastTopics.slice(-5)
      };
      writeFileSync(PROFILE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('[Profile] Save failed:', e.message); }
  }

  /** 从用户的输入中提取信息 */
  learn(/* userText */) {
    // Simple rule-based learning
    this.conversationCount++;
    this._save();
  }

  /** 添加一个新事实 */
  addFact(key, value) {
    if (!this.facts[key]) this.facts[key] = [];
    if (!this.facts[key].includes(value)) {
      this.facts[key].push(value);
      this._save();
    }
  }

  /** 记录一个使用过的短语 */
  recordPhrase(text) {
    const short = text.slice(0, 30);
    if (!this.phrases.has(short)) {
      this.phrases.add(short);
      this._save();
    }
  }

  /** 记录最近话题 */
  addTopic(topic) {
    this.lastTopics.push(topic);
    if (this.lastTopics.length > 10) this.lastTopics.shift();
    this._save();
  }

  /** 别回复和过去一模一样的句子 */
  isRepeat(text) {
    return this.phrases.has(text.slice(0, 30));
  }

  /** 生成画像摘要，注入到 prompt */
  getSummary() {
    const parts = [];
    if (this.conversationCount > 3) {
      parts.push(`你们已经聊过${this.conversationCount}次天了，越来越熟悉彼此。`);
    }
    if (this.facts['称呼']?.length) {
      parts.push(`他喜欢叫你：${this.facts['称呼'].join('、')}。`);
    }
    if (this.lastTopics.length) {
      parts.push(`最近聊过：${[...new Set(this.lastTopics)].join('、')}。`);
    }
    parts.push('每次回复都要不一样，不要重复以前说过的话。');
    return parts.join(' ');
  }
}
