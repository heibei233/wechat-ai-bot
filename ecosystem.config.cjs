// PM2 ecosystem config for WeCom AI Bot + serveo tunnel
module.exports = {
  apps: [
    {
      name: 'wecom-bot',
      cwd: __dirname,
      script: 'src/index.js',
      interpreter: 'node',
      // Env is read from .env file (dotenv)
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Logging
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Watch .env for changes
      watch: ['.env'],
      watch_delay: 5000,
      ignore_watch: ['node_modules', 'logs', '.git']
    },
    {
      name: 'wecom-tunnel',
      cwd: __dirname,
      script: 'scripts/tunnel.js',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      out_file: './logs/tunnel-out.log',
      error_file: './logs/tunnel-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
