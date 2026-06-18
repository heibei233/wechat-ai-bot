import { DeepSeekClient } from './ai/deepseekClient.js';
import { runConsoleAdapter } from './adapters/console.js';
import { ChatService } from './bot/chatService.js';
import { config, validateConfig } from './config.js';
import { ChatMemory } from './memory/chatMemory.js';

validateConfig();

const aiClient = new DeepSeekClient({
  ...config.deepseek,
  systemPrompt: config.bot.systemPrompt
});

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
