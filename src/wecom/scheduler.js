// 定时消息调度器 — 主动给用户发消息
import { sendKefuMessage } from './kefuApi.js';
import { getWeather } from './weather.js';

const activeJobs = [];

// cron 格式: 分 时 日 月 星期 (5 段)
// 特殊格式: RANDOM/min-max  (随机间隔，分钟)
// prompt 中用 ; 分隔多个可选提示词（随机选一个）
// prompt 中用 {weather} 会被替换为天气数据

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron: ${expr}`);
  return { minute: parts[0], hour: parts[1], day: parts[2], month: parts[3], weekday: parts[4] };
}

function matches(field, value) {
  if (field === '*') return true;
  if (field.startsWith('*/')) return value % parseInt(field.slice(2)) === 0;
  if (field.includes(',')) return field.split(',').map(Number).includes(value);
  return parseInt(field) === value;
}

function shouldFire(cron) {
  const now = new Date();
  const c = parseCron(cron);
  return (
    matches(c.minute, now.getMinutes()) &&
    matches(c.hour, now.getHours()) &&
    matches(c.day, now.getDate()) &&
    matches(c.month, now.getMonth() + 1) &&
    matches(c.weekday, now.getDay())
  );
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Rate limiter: don't send more than once every N minutes
function createRateLimiter(minMinutes) {
  let lastTime = 0;
  return {
    canSend() {
      return (Date.now() - lastTime) > minMinutes * 60 * 1000;
    },
    mark() {
      lastTime = Date.now();
    }
  };
}

export function startScheduler({ apiConfig, chatService, userId, schedules }) {
  console.log(`[Scheduler] Starting with ${schedules.length} jobs for user ${userId}`);

  const lastFire = new Map();
  const lastWeatherFetch = { time: 0, data: null };
  const rateLimit = createRateLimiter(15); // Min 15 min between any scheduled messages

  async function fetchWeather() {
    // Cache weather for 30 minutes
    if (Date.now() - lastWeatherFetch.time < 30 * 60 * 1000 && lastWeatherFetch.data) {
      return lastWeatherFetch.data;
    }
    const w = await getWeather('Chengdu');
    if (w) {
      lastWeatherFetch.data = w;
      lastWeatherFetch.time = Date.now();
    }
    return w || lastWeatherFetch.data || '暂无天气数据';
  }

  // Resolve prompt: pick random from ;-separated options, replace {weather}
  async function resolvePrompt(raw) {
    const options = raw.split(';').map(s => s.trim()).filter(Boolean);
    let prompt = pickRandom(options);
    if (prompt.includes('{weather}')) {
      const weather = await fetchWeather();
      prompt = prompt.replace(/\{weather\}/g, weather);
    }
    return prompt;
  }

  async function executeJob(job, jobIndex) {
    if (!rateLimit.canSend()) {
      console.log(`[Scheduler] Rate limited, skipping job ${jobIndex}`);
      return;
    }

    const now = new Date();
    const key = `${jobIndex}:${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
    if (lastFire.get(jobIndex) === key) return;
    lastFire.set(jobIndex, key);

    const prompt = await resolvePrompt(job.prompt);
    console.log(`[Scheduler] Job ${jobIndex}: ${prompt.slice(0, 60)}...`);

    try {
      const aiText = await chatService.handleText({
        conversationId: job.conversationId || `kefu-scheduler:${userId}`,
        text: prompt
      });

      if (!aiText) {
        console.log(`[Scheduler] AI returned empty for job ${jobIndex}`);
        return;
      }

      const r = await sendKefuMessage(apiConfig, userId, aiText);
      if (r && r.errcode === 0) {
        rateLimit.mark();
        console.log(`[Scheduler] Sent: ${aiText.slice(0, 80)}...`);
      } else {
        console.error(`[Scheduler] Send failed [${r?.errcode}]: ${r?.errmsg}`);
      }
    } catch (e) {
      console.error(`[Scheduler] Job ${jobIndex} error:`, e.message);
    }
  }

  async function checkAll() {
    for (let i = 0; i < schedules.length; i++) {
      try {
        const job = schedules[i];
        if (job.cron === 'RANDOM') {
          // Random interval job — fire with probability based on interval
          const [min, max] = job.interval || [60, 180]; // default 1-3 hours
          const range = max - min;
          const probPerCheck = range > 0 ? 30 / ((min + range / 2) * 60) : 30 / (min * 60);
          if (Math.random() < probPerCheck && rateLimit.canSend()) {
            const lastKey = `rand:${i}`;
            const minSinceLast = min * 60 * 1000;
            if (Date.now() - (lastFire.get(lastKey) || 0) > minSinceLast) {
              lastFire.set(lastKey, Date.now());
              await executeJob(job, i);
            }
          }
        } else if (shouldFire(job.cron)) {
          await executeJob(job, i);
        }
      } catch (e) {
        // continue
      }
    }
  }

  // Check every 30 seconds
  const interval = setInterval(checkAll, 30000);
  checkAll();

  function stop() { clearInterval(interval); }
  activeJobs.push(stop);
  return stop;
}

export function stopAllSchedulers() {
  activeJobs.forEach(s => s());
  activeJobs.length = 0;
}
