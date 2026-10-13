// PM2 processes for Zentra on one Linux server (docs/deploy.md): the Next app and the realtime
// process. Both read .env from the project folder. Start: pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'zentra-web',
      cwd: __dirname + '/..',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3010',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
    },
    {
      name: 'zentra-realtime',
      cwd: __dirname + '/..',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: '--tsconfig jsconfig.json server/realtime.js',
      env: { NODE_ENV: 'production', ZENTRA_REALTIME_PORT: '3011' },
      max_memory_restart: '300M',
    },
  ],
}
