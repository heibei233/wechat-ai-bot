import { runConsoleAdapter } from './adapters/console.js';
import { ChatService } from './bot/chatService.js';
import { config, validateConfig } from './config.js';
import { ChatMemory } from './memory/chatMemory.js';
import { AiRouter } from './ai/aiRouter.js';

validateConfig();

const aiClient = new AiRouter({
  deepseek: config.deepseek,
  ollama: config.ollama,
  deepseekPrompt: process.env.DEEPSEEK_PROMPT || config.bot.systemPrompt,
  ollamaPrompt: process.env.OLLAMA_PROMPT || process.env.BOT_SYSTEM_PROMPT || config.bot.systemPrompt
});
console.log(`AI 路由已就绪 — 自动检测 Ollama，不可用时回退 DeepSeek`);

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
