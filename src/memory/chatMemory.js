import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = 'data';
const MEMORY_FILE = resolve(DATA_DIR, 'chat-history.json');

// Ensure data directory exists
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

let saveTimer = null;

export class ChatMemory {
  constructor({ maxTurns = 10 } = {}) {
    this.maxMessages = maxTurns * 2; // user + assistant per turn
    this.byConversation = new Map();
    this._load();
  }

  _load() {
    try {
      if (existsSync(MEMORY_FILE)) {
        const raw = readFileSync(MEMORY_FILE, 'utf8');
        const data = JSON.parse(raw);
        for (const [id, msgs] of Object.entries(data)) {
          // Only keep the last maxMessages per conversation
          this.byConversation.set(id, msgs.slice(-this.maxMessages));
        }
        const totalMsgs = [...this.byConversation.values()].reduce((s, m) => s + m.length, 0);
        console.log(`[Memory] Loaded ${this.byConversation.size} conversations (${totalMsgs} messages)`);
      }
    } catch (e) {
      console.error('[Memory] Load failed:', e.message);
    }
  }

  _save() {
    // Debounce saves
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const obj = {};
        for (const [id, msgs] of this.byConversation) {
          if (msgs.length > 0) obj[id] = msgs;
        }
        writeFileSync(MEMORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
      } catch (e) {
        console.error('[Memory] Save failed:', e.message);
      }
    }, 2000);
  }

  get(conversationId) {
    return this.byConversation.get(conversationId) || [];
  }

  append(conversationId, role, content) {
    const current = this.get(conversationId);
    const next = [...current, { role, content }].slice(-this.maxMessages);
    this.byConversation.set(conversationId, next);
    this._save();
  }

  reset(conversationId) {
    this.byConversation.delete(conversationId);
    this._save();
  }

  // Graceful shutdown — flush pending saves immediately
  flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      const obj = {};
      for (const [id, msgs] of this.byConversation) {
        if (msgs.length > 0) obj[id] = msgs;
      }
      writeFileSync(MEMORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      console.error('[Memory] Flush failed:', e.message);
    }
  }
}
