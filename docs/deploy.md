# Running Zentra on your own Linux server

Zentra runs as two Node processes behind nginx on one machine, with MySQL beside them:

| Process | Port | What it does |
| --- | --- | --- |
| `zentra-web` (`next start`) | 3010 | The site and its API |
| `zentra-realtime` (`server/realtime.js`) | 3011 | People walking together and live chat (WebSocket at `/ws`) |
| nginx | 80, 443 | HTTPS for both, on one domain |
| MySQL | 3306 | All data: accounts, chat, the job board and agent indexes |

Positions of people walking are kept in memory only; everything else is in MySQL.

## 1. Install (Ubuntu or Debian)

```bash
# Node 22+ and pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx mysql-server certbot python3-certbot-nginx
sudo corepack enable
sudo npm install -g pm2
```

## 2. Database

```bash
sudo mysql -e "CREATE DATABASE zentra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'zentra'@'localhost' IDENTIFIED BY 'choose-a-long-password';
GRANT ALL ON zentra.* TO 'zentra'@'localhost';"
```

Zentra creates its tables on first start. To move your local data, export the `zentra` database
from XAMPP (phpMyAdmin, or `mysqldump zentra > zentra.sql`) and import it on the server
(`mysql zentra < zentra.sql`).

## 3. The code and settings

```bash
git clone <your repository> /srv/zentra && cd /srv/zentra
pnpm install
cp .env.example .env
nano .env
```

Set at least:

- `NEXT_PUBLIC_BASE_URL` and `ZENTRA_APP_ORIGIN`: `https://your-domain`
- `ZENTRA_DATABASE_URL`: `mysql://zentra:choose-a-long-password@127.0.0.1:3306/zentra`
- `ZENTRA_ENCRYPTION_KEY`: the same 64 hex characters as now (copy it from `.env.local`), or the
  stored keys and sign-in codes stop working. New install: `openssl rand -hex 32`.
- `ZENTRA_SMTP_*` (or `SMTP_*`): the mail settings for sign-in codes.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: optional, for mobile wallets by QR code.
- `ZENTRA_MODERATORS`: your public name, to moderate chat.
- `ZENTRA_SIGNUP_TOKEN`: only if new accounts should need an invite.

Then build:

```bash
pnpm build
```

## 4. Start and keep running

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # prints one command to run, so both start after a reboot
```

`pm2 logs zentra-realtime` and `pm2 logs zentra-web` show their output.

## 5. nginx and HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/zentra
sudo sed -i 's/zentra.example.com/your-domain/g' /etc/nginx/sites-available/zentra
sudo ln -s /etc/nginx/sites-available/zentra /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain
```

Point your domain's DNS A record at the server first. Ports 80 and 443 must be open
(`sudo ufw allow 'Nginx Full'`); 3010, 3011 and 3306 stay closed to the outside.

## Updating

```bash
cd /srv/zentra && git pull && pnpm install && pnpm build && pm2 reload all
```

## Development on your computer

`pnpm dev:ssl` for the site (https://localhost:3010) and, in a second terminal, `pnpm realtime`
for walking together and chat. The realtime process uses the dev server's local certificate in
`certificates/`, so start `pnpm dev:ssl` once first.
