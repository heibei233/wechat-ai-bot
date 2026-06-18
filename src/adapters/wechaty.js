let qrcodeTerminal;
let WechatyBuilder;
let types;

try {
  qrcodeTerminal = (await import('qrcode-terminal')).default;
  ({ WechatyBuilder, types } = await import('wechaty'));
} catch (error) {
  throw new Error(
    'Wechaty dependencies are missing. Run "npm run install:wechaty" first, then configure your puppet/token if needed.'
  );
}

let qrServer;
try {
  qrServer = await import('../web/qrServer.js');
} catch {
  // QR server optional — skip if express not installed
}

function isAllowed(value, allowList) {
  return allowList.length === 0 || allowList.includes(value);
}

async function getRoomMentionText(message, bot) {
  const mentioned = await message.mentionSelf();
  if (!mentioned) return null;

  const botName = bot.userSelf().name() || '';
  const rawText = message.text();

  return rawText
    .replace(new RegExp(`@${botName}\\s*`, 'g'), '')
    .replace(/\u2005/g, ' ')
    .trim();
}

export async function runWechatyAdapter({ chatService, config }) {
  const bot = WechatyBuilder.build({
    name: 'wechat-ai-bot'
  });

  bot
    .on('scan', (qrcode, status) => {
      if (status === types.ScanStatus.Waiting || status === types.ScanStatus.Timeout) {
        qrcodeTerminal.generate(qrcode, { small: true });
        console.log(`Scan QR code to log in. Status: ${types.ScanStatus[status]}`);
        if (qrServer) qrServer.updateQR(qrcode);
      }
    })
    .on('login', (user) => {
      console.log(`Logged in as ${user.name()}`);
      if (qrServer) qrServer.updateLogin(user.name());
    })
    .on('logout', (user, reason) => {
      console.log(`Logged out: ${user.name()}. Reason: ${reason || 'unknown'}`);
      if (qrServer) qrServer.updateLogout(user.name());
      // Auto-restart: try to log back in after 3 seconds
      setTimeout(() => {
        console.log('Attempting to re-login...');
        bot.start().catch(err => console.error('Re-login failed:', err.message));
      }, 3000);
    })
    .on('message', async (message) => {
      try {
        if (message.self()) return;
        if (message.type() !== types.Message.Text) return;

        const room = message.room();
        const talker = message.talker();

        if (room) {
          const topic = await room.topic();
          if (!isAllowed(topic, config.bot.allowRooms)) return;

          const text = await getRoomMentionText(message, bot);
          if (!text) return;

          const conversationId = `room:${topic}`;
          const reply = await chatService.handleText({ conversationId, text });
          if (reply) await room.say(reply, talker);
          return;
        }

        const contactName = talker.name();
        const alias = await talker.alias();
        const displayName = alias || contactName;

        if (!isAllowed(displayName, config.bot.allowPrivateContacts)) return;

        const conversationId = `contact:${displayName}`;
        const reply = await chatService.handleText({
          conversationId,
          text: message.text()
        });

        if (reply) await message.say(reply);
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });

  await bot.start();
}
