import { runConsoleAdapter } from './adapters/console.js';
import { ChatService } from './bot/chatService.js';
import { config, validateConfig } from './config.js';
import { ChatMemory } from './memory/chatMemory.js';

validateConfig();

let aiClient;
if (config.aiProvider === 'ollama') {
  const { OllamaClient } = await import('./ai/ollamaClient.js');
  aiClient = new OllamaClient({
    ...config.ollama,
    systemPrompt: config.bot.systemPrompt
  });
  console.log(`使用本地 Ollama: ${config.ollama.model}`);
} else {
  const { DeepSeekClient } = await import('./ai/deepseekClient.js');
  aiClient = new DeepSeekClient({
    ...config.deepseek,
    systemPrompt: config.bot.systemPrompt
  });
  console.log(`使用云端 DeepSeek: ${config.deepseek.model}`);
}

const memory = new ChatMemory({ maxTurns: config.bot.maxTurns });
const chatService = new ChatService({ aiClient, memory });

if (config.adapter === 'console') {
  await runConsoleAdapter({ chatService });
} else if (config.adapter === 'wecom') {
  const { runWecomAdapter } = await import('./adapters/wecom.js');
  await runWecomAdapter({ chatService, config });
} else if (config.adapter === 'kefu') {
  const { runKefuAdapter } = await import('./adapters/kefu.js');
  await runKefuAdapter({ chatService, config });
} else {
  const { runWechatyAdapter } = await import('./adapters/wechaty.js');
  await runWechatyAdapter({ chatService, config });
}
