// Ollama local AI client — no filtering, no censorship
import OpenAI from 'openai';

export class OllamaClient {
  constructor({ baseURL, model, systemPrompt }) {
    this.model = model || 'qwen2.5:7b';
    this.systemPrompt = systemPrompt || '';
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: baseURL || 'http://localhost:11434/v1'
    });
  }

  async reply(history, userText) {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...(history || []),
      { role: 'user', content: userText }
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model, messages, temperature: 0.9, top_p: 0.95
    });

    let content = completion.choices?.[0]?.message?.content?.trim() || '';
    content = content.replace(/[\s\S]*?<\/think>/g, '').replace(/[\s\S]*?<\/thinking>/g, '').trim();

    // 后处理：替换漏网的英文词
    const EN_MAP = {
      '\\bcock\\b': '鸡巴', '\\bpussy\\b': '小穴', '\\bfuck\\b': '操',
      '\\bwet\\b': '湿', '\\bclit\\b': '阴蒂', '\\bcum\\b': '精液',
      '\\bass\\b': '屁股', '\\btits\\b': '奶子', '\\bballs\\b': '蛋蛋',
      '\\bcunt\\b': '骚穴', '\\bdick\\b': '鸡巴'
    };
    for (const [en, cn] of Object.entries(EN_MAP)) {
      content = content.replace(new RegExp(en, 'gi'), cn);
    }
    return content;
  }

  setSystemPrompt(prompt) { this.systemPrompt = prompt; }
}
