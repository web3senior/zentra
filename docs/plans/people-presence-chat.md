# People in the colony: wallet sign-in, walking together, area chat and 1:1 chat — approved

Approved by the owner on 2026-10-13 ("build that plan"). The decisions below were not answered, so
the recommended defaults apply until the owner changes them: only signed-in people are shown; a
public name is chosen before appearing; areas are hub, job board, LUKSO and Monad; moderators come
from `ZENTRA_MODERATORS` (empty until set); Solana later; WalletConnect appears once
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set.

Owner's direction (2026-10-13): start from people. Signed-in people walk the colony together as
astronauts and talk in group chat by area or 1:1. Zentra runs on the owner's own Linux server, so a
small WebSocket process carries the live parts. Everything is stored in **Zentra's own MySQL
database** (`lib/zentra/database.js`), never hupsocial's; code is copied from hupsocial where it
fits. Wallets are used **only to sign in**: no transactions, spending or contracts, and no agents.

## What people get

1. **Walking together.** Everyone signed in who is walking appears as an astronaut with a name tag,
   moving live (about 10 updates a second, smoothed in between). Visitors who are not signed in
   can watch but are not shown.
2. **Area chat.** One group room per place: the hub (home colony), the job board, LUKSO and Monad.
   You see the room of the area you stand in, and can switch to another area's room. The chat
   panel says who is in the area.
3. **1:1 chat.** Select an astronaut (or a name in a chat line) and choose Message. Messages wait
   for people who are offline; an unread count shows on the account menu and the chat button.
4. **In both:** text up to 1,000 characters, reply to a line, emoji reactions (hupsocial's eight),
   edit and delete your own line, "typing…", and "who is here".

## Wallet sign-in (owner's request, 2026-10-13)

Beside email, people sign in with any wallet, using hupsocial's connection code (wagmi and viem):

- **Which wallets:** every browser wallet the page detects (EIP-6963: MetaMask, Rabby, Coinbase,
  the LUKSO Universal Profile extension and others), WalletConnect for mobile wallets by QR code,
  Safe, and the LUKSO Grid's Universal Profile (`@lukso/up-provider`), as hupsocial lists them.
  hupsocial's email embedded wallet is not included.
- **How:** the wallet signs a standard sign-in message (EIP-4361: this domain, a one-time nonce,
  chain id, 10-minute expiry). The server checks it with viem's `verifyMessage`, which accepts
  ordinary wallets and smart accounts (ERC-1271), so a Universal Profile signs through its own
  contract. The signature signs in and nothing else; it never approves a transaction.
- **Accounts:** the first wallet sign-in creates an account (a public name is chosen first); a
  signed-in person can link more wallets, or an email, from the account menu. Table
  `user_wallets` (address, owner, universal profile flag, linked) and `wallet_nonces` (nonce,
  address, expires), in Zentra's MySQL.
- **Addresses stay private:** others see the public name, never the address.

### Universal Profile character

When the signed-in address is a LUKSO Universal Profile (it answers `supportsInterface(0x24871b3d)`,
LSP0, on LUKSO mainnet), the person walks as a **UP astronaut**: a distinct suit in LUKSO's pink
(a new `--color-garden-*` token), with the UP mark on the helmet and chest, and a small UP badge on
the name tag. It can also show the profile's own name from its LSP3 metadata, labelled as the
profile's. It is shown only for a verified signature, so nobody can claim a profile they do not
control.

## How it works

- **Realtime process** `server/realtime.js`, Node with the `ws` package, port 3011, beside
  `next start`. It reads the `zentra_session` cookie on connect and checks it against `sessions`,
  so sign-in is shared with the site. It holds positions **in memory only** (never written to the
  database), relays typing, and handles chat writes: validate, rate limit, store in MySQL,
  broadcast to the room.
- **History over HTTP** in the existing API: `GET /api/zentra/chat/:room?before=<id>` pages older
  lines; `GET /api/zentra/chat/dm` lists your conversations with unread counts. Sending always
  goes through the WebSocket, so there is one write path.
- **Rooms** are named `area:<id>` (areas listed in `config/site.js`) and `dm:<userA>:<userB>`
  (the two user ids in sorted order). Only the two people can read or write a `dm:` room.
- **Tables** (added to `database.js`), copied from hupsocial's chat and trimmed to text:
  - `chat_messages` (id, room, sender, body, reply_to, created, edited, deleted, deleted_by)
  - `chat_reactions` (message, user, emoji)
  - `chat_reads` (user, room, last read id): unread counts and offline delivery
  - `chat_blocks` (user, blocked)
  - `chat_reports` (message, reporter, reason, created)
  - Area rooms keep their newest 1,000 lines, as hupsocial does; 1:1 conversations are kept.
- **Client:** other astronauts reuse `Human.jsx`; their positions are interpolated between updates.
  The chat panel docks on the colony's right side like the job board panel, styled with Zentra's
  tokens. hupsocial's ChatDock (2,500 lines with media, GIFs and voice) is the reference, not a
  copy: this starts with text.
- **Hidden tabs and the colony off screen** close the connection, as the frame loop already stops;
  it reconnects on return with backoff.

## Safety

- Only signed-in people are shown or can write. Every connection is tied to a session.
- Rate limits per person: position updates at most 15 a second (extras dropped), 20 messages a
  minute (hupsocial's), 10 new 1:1 conversations an hour.
- Plain text only, never rendered as HTML; links shown as text with `rel="nofollow noopener"`.
- **Block:** a blocked person cannot message you 1:1, and you no longer see their lines or their
  astronaut. **Report** stores the line for moderators.
- **Moderators** are listed by username in `ZENTRA_MODERATORS`; they can delete any line and mute a
  person for a time (stored on the user).
- **Public name:** today a new account's username is taken from its email (`carol.smith@…` becomes
  `carol-smith`). Before anyone appears to others, they choose a public name (3–32 characters,
  unique); the email is never shown.

## Running it on the owner's server

Files under `deploy/`, applied by the owner (Claude does not connect to the server):

- `ecosystem.config.cjs` (PM2): `zentra-web` (`next start`, port 3010) and `zentra-realtime` (port
  3011).
- `nginx.conf`: HTTPS (Let's Encrypt), `/` to 3010, `/ws` to 3011 with the WebSocket upgrade
  headers; one domain, so the session cookie reaches both.
- `docs/deploy.md`: install Node, pnpm, MySQL, PM2, nginx and certbot; set `.env`; build; start;
  update.

In development, `pnpm realtime` runs beside `pnpm dev:ssl`, using the same local certificate so
`wss://localhost:3011` works from the https page.

## Order of work

1. Public names, wallet sign-in and the UP character; the realtime process; walking together.
2. Area chat with history, replies, reactions, edit/delete, typing and who is here.
3. 1:1 chat, unread counts, block, report and moderators.
4. Deployment files and guide.

Each step is usable on its own and is tested before the next: unit tests for room access, rate
limits and message rules; an integration test that connects two clients to the realtime process.

## Not in this plan

Images, files, voice and GIFs; push or email notifications; agents in chat; voice or proximity
audio; servers beyond one machine.

## Decisions for the owner

0. **Wallets:** EVM wallets as listed above. **Solana** (Phantom), which hupsocial also supports:
   now, or later? WalletConnect needs a free project id from Reown
   (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`): can you create one, or reuse hupsocial's?

1. **Who is shown walking:** only signed-in people (recommended), or guests too as "Visitor"?
2. **Public name:** choose one before appearing (recommended), or show the email-based username?
3. **Areas:** hub, job board, LUKSO, Monad, as above?
4. **Moderators:** your username to start with?
