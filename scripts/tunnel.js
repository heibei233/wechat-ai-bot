// Serveo SSH tunnel wrapper — captures and persists the public URL
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const LOG_DIR = 'logs';
const URL_FILE = 'logs/public-url.txt';

mkdirSync(LOG_DIR, { recursive: true });

// Fixed subdomain + SSH key for serveo
const SUBDOMAIN = 'heibei';
const KEY_PATH = 'serveo_key';

const ssh = spawn('C:\\Windows\\System32\\OpenSSH\\ssh.exe', [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=60',
  '-o', 'ExitOnForwardFailure=yes',
  '-i', KEY_PATH,
  '-R', `${SUBDOMAIN}:80:localhost:3000`,
  'serveo.net'
], {
  stdio: ['ignore', 'pipe', 'pipe']
});

ssh.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
});

ssh.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Use fixed URL since we have a reserved subdomain
const fixedUrl = `https://${SUBDOMAIN}.serveousercontent.com`;
writeFileSync(URL_FILE, fixedUrl + '\n');
console.log(`\n[服务] 固定公网地址: ${fixedUrl}`);
console.log(`[服务] 回调 URL: ${fixedUrl}/wecom\n`);

ssh.on('close', (code) => {
  console.log(`SSH tunnel exited with code ${code}`);
  process.exit(code || 1);
});

ssh.on('error', (err) => {
  console.error('SSH tunnel error:', err.message);
  process.exit(1);
});

// Keep alive
process.on('SIGINT', () => ssh.kill());
process.on('SIGTERM', () => ssh.kill());
