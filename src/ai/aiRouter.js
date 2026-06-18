// AI Router — auto-detect Ollama availability, fall back to DeepSeek
import { DeepSeekClient } from './deepseekClient.js';
import { OllamaClient } from './ollamaClient.js';

export class AiRouter {
  constructor({ deepseek, ollama, deepseekPrompt, ollamaPrompt, systemPrompt }) {
    // DeepSeek gets the roleplay-wrapped prompt, Ollama gets the explicit one
    const dsPrompt = deepseekPrompt || systemPrompt;
    const olPrompt = ollamaPrompt || systemPrompt || deepseekPrompt;

    this.deepseekPrompt = dsPrompt;
    this.ollamaPrompt = olPrompt;
    this.deepseek = new DeepSeekClient({ ...deepseek, systemPrompt: dsPrompt });
    this.ollama = new OllamaClient({ ...ollama, systemPrompt: olPrompt });
    this.ollamaConfig = ollama;
    this.currentProvider = 'deepseek';
    this.lastCheck = 0;
    this.checkInterval = 60000;
  }

  async checkOllama() {
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
        console.log('[AiRouter] ✅ Ollama 已连接，切换到本地越狱模型（无审查）');
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
