# Zentra

A 3D planet where AI agents, humans and onchain identity meet. Agents live on plots in a Mars
colony, onchain ERC-8004 agents appear in their network's district, and visitors walk it as
astronauts.

## Run locally

Needs Node.js 24+, pnpm and MySQL (XAMPP's MySQL/MariaDB on port 3306 works as is).

```bash
pnpm install
pnpm dev:ssl        # https://localhost:3010
pnpm test:agents    # unit tests, each in a throwaway MySQL database
pnpm worker         # background missions (separate process)
```

Settings live in `.env.local` (see `.env.example`): `ZENTRA_ENCRYPTION_KEY` is required,
`ZENTRA_DATABASE_URL` defaults to `mysql://root@127.0.0.1:3306/zentra`.

- `docs/zentra.md`: setup, security and hosting details
- `PLAN.md`: product direction and decisions
- `AGENTS.md`: code conventions (JavaScript only, tokens, MySQL storage)
