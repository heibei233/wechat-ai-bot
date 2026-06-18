import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export async function runConsoleAdapter({ chatService }) {
  const rl = readline.createInterface({ input, output });
  const conversationId = 'console';

  console.log('Console bot is ready. Type /reset to clear memory, /exit to quit.');

  while (true) {
    const text = await rl.question('you> ');

    if (text.trim() === '/exit') {
      rl.close();
      return;
    }

    try {
      const reply = await chatService.handleText({ conversationId, text });
      if (reply) console.log(`bot> ${reply}`);
    } catch (error) {
      console.error('bot> 调用 AI 失败：', error.message);
    }
  }
}
