# WeChat AI Bot

Personal WeChat AI chat bot skeleton using Node.js, WeChaty, and DeepSeek's OpenAI-compatible API.

## Important note

Personal WeChat bots are not an official WeChat Open Platform integration. Use a test account first. The account may be logged out, limited, or banned depending on the puppet/provider and usage pattern.

For production or business use, prefer Official Account or WeCom.

## Quick start

```bash
npm install
cp .env.example .env
```

Edit `.env` and set:

```bash
DEEPSEEK_API_KEY=sk-...
```

Test DeepSeek without WeChat:

```bash
npm run console
```

Run the WeChat adapter:

```bash
npm run install:wechaty
npm run wechat
```

Depending on your WeChaty puppet, you may also need to set:

```bash
WECHATY_PUPPET=wechaty-puppet-service
WECHATY_PUPPET_SERVICE_TOKEN=...
```

Different puppets have different login behavior. Some can show a QR code, some require a paid token, and some personal-WeChat routes may stop working when WeChat changes its client rules.

## Behavior

- Private chats: replies to allowed contacts, or everyone if `ALLOW_PRIVATE_CONTACTS` is empty.
- Group chats: replies only when the bot is mentioned.
- Memory: keeps the latest 10 messages per conversation in memory.
- Safety: ignores self messages, empty messages, unsupported message types, and disallowed contacts/groups.

## Project layout

```text
src/
  config.js              Environment config
  index.js               Adapter bootstrap
  ai/deepseekClient.js   DeepSeek chat calls
  memory/chatMemory.js   Per-conversation memory
  adapters/console.js    Local terminal testing
  adapters/wechaty.js    Personal WeChat adapter
```

## Next useful upgrades

- Persistent memory with SQLite.
- Admin commands such as `/reset`, `/pause`, `/model`.
- Rate limits and reply queue for safer WeChat usage.
- Knowledge base retrieval for documents.

## Troubleshooting

- If `npm run install:wechaty` fails on Windows, run it in a normal local path such as `C:\projects\wechat-ai-bot`, or install Visual Studio Build Tools with the C++ workload.
- If your project is inside WSL, use Linux Node.js/npm inside WSL instead of Windows Node.js/npm through a UNC path.
- If the bot logs in but does not reply in a group, confirm you mentioned the bot account and that `ALLOW_ROOMS` is empty or contains the exact group topic.
