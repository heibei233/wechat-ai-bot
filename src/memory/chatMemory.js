export class ChatMemory {
  constructor({ maxTurns = 10 } = {}) {
    this.maxMessages = maxTurns * 2;
    this.byConversation = new Map();
  }

  get(conversationId) {
    return this.byConversation.get(conversationId) || [];
  }

  append(conversationId, role, content) {
    const current = this.get(conversationId);
    const next = [...current, { role, content }].slice(-this.maxMessages);
    this.byConversation.set(conversationId, next);
  }

  reset(conversationId) {
    this.byConversation.delete(conversationId);
  }
}
