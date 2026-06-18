export class ChatService {
  constructor({ aiClient, memory }) {
    this.aiClient = aiClient;
    this.memory = memory;
  }

  async handleText({ conversationId, text }) {
    const trimmed = text.trim();

    if (!trimmed) {
      return null;
    }

    if (trimmed === '/reset') {
      this.memory.reset(conversationId);
      return '已清空这段对话的上下文。';
    }

    const history = this.memory.get(conversationId);
    const reply = await this.aiClient.reply(history, trimmed);

    this.memory.append(conversationId, 'user', trimmed);
    this.memory.append(conversationId, 'assistant', reply);

    return reply;
  }
}
