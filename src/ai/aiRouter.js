// AI Router — auto-detect Ollama availability, fall back to DeepSeek
import { DeepSeekClient } from './deepseekClient.js';
import { OllamaClient } from './ollamaClient.js';

export class AiRouter {
  constructor({ deepseek, ollama, systemPrompt }) {
    this.systemPrompt = systemPrompt;
    this.deepseek = new DeepSeekClient({ ...deepseek, systemPrompt });
    this.ollama = new OllamaClient({ ...ollama, systemPrompt });
    this.ollamaConfig = ollama;
    this.currentProvider = 'deepseek'; // default
    this.lastCheck = 0;
    this.checkInterval = 60000; // re-check every 60s
    this.checking = null;
  }

  async checkOllama() {
    // Don't check too often
    if (Date.now() - this.lastCheck < this.checkInterval) {
      return this.currentProvider === 'ollama';
    }
    this.lastCheck = Date.now();

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${this.ollamaConfig.baseURL.replace('/v1', '')}/api/tags`, {
        signal: ctrl.signal
      });
      clearTimeout(timeout);
      const ok = res.ok;
      if (ok && this.currentProvider !== 'ollama') {
        console.log('[AiRouter] ✅ Ollama 已连接，切换到本地越狱模型');
      } else if (!ok && this.currentProvider === 'ollama') {
        console.log('[AiRouter] ❌ Ollama 断开，回退到 DeepSeek');
      }
      this.currentProvider = ok ? 'ollama' : 'deepseek';
      return ok;
    } catch {
      if (this.currentProvider === 'ollama') {
        console.log('[AiRouter] ❌ Ollama 不可用，回退到 DeepSeek');
      }
      this.currentProvider = 'deepseek';
      return false;
    }
  }

  async reply(history, userText) {
    // Check Ollama before each reply (throttled)
    await this.checkOllama();

    if (this.currentProvider === 'ollama') {
      try {
        return await this.ollama.reply(history, userText);
      } catch (e) {
        console.error('[AiRouter] Ollama 调用失败，回退 DeepSeek:', e.message);
        this.currentProvider = 'deepseek';
        return await this.deepseek.reply(history, userText);
      }
    }

    return await this.deepseek.reply(history, userText);
  }
}
