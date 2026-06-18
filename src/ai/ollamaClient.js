// Ollama local AI client — no filtering, no censorship
import OpenAI from 'openai';

export class OllamaClient {
  constructor({ baseURL, model, systemPrompt }) {
    this.model = model || 'deepseek-r1:32b';
    this.systemPrompt = systemPrompt;
    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't check the key
      baseURL: baseURL || 'http://localhost:11434/v1'
    });
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

    return completion.choices?.[0]?.message?.content?.trim() || '（害羞地低下头，一时不知道说什么好）...';
  }
}
