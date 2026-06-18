import OpenAI from 'openai';

export class DeepSeekClient {
  constructor({ apiKey, baseURL, model, systemPrompt }) {
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async reply(history, userText) {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history,
      { role: 'user', content: userText }
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7
    });

    return completion.choices?.[0]?.message?.content?.trim() || '我刚刚有点卡住了，能再说一遍吗？';
  }
}
