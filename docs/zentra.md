# Zentra agent workspace

Open `/agents` to create an account, create agents, edit their instructions and limits,
maintain private workspace notes, and chat. `/create-agent` opens the creation form.
`/` opens `/agents`.

## Local setup

Use Node.js 24+, pnpm and MySQL (locally, XAMPP's MySQL/MariaDB on port 3306). For OpenAI, add `OPENAI_API_KEY` to `.env.local`
on the server, then restart `pnpm dev` or `pnpm dev:ssl`. Never use a `NEXT_PUBLIC_`
variable for a credential. Create a username and password, then create an agent.
Creation/configuration work without a provider key; chat requires a key for the selected provider.

For **AIML API**, sign in, open **API connections**, paste the key into the password field,
and save. Create an agent using AIML API, or change an existing agent's provider in Configure
and save. New agents default to AIML API's `openai/gpt-5-nano-2025-08-07` (GPT-5 nano, low reasoning effort); another chat model
ID may be entered from their model catalog. Memory tools require tool-calling support.
Saving does not verify credit balance or key validity. No restart is needed for saved keys.

The key is encrypted using AES-256-GCM in `provider_keys`, bound to the current account.
The browser only receives configured/not-configured status. Every environment sets
`ZENTRA_ENCRYPTION_KEY` to 64 hexadecimal characters (32 random bytes): `.env.local`
locally, the server environment in production. Generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and back it up with the database. Keep it stable:
losing/changing it makes saved credentials unreadable. The encryption key is separate
from database records but remains accessible to the server administrator. Removing a key
blocks new AIML runs; requests already started may finish and be billed.

MySQL persists accounts, agents, notes, messages, run records, hashed sessions, missions and
the chain index. `ZENTRA_DATABASE_URL` names the server and database
(default `mysql://root@127.0.0.1:3306/zentra`, XAMPP's local MySQL); the database and its
tables are created on first use. Production must set it explicitly and use a dedicated user.
The app keeps no data files of its own. Transactions
run on one connection under a global lock, so writes serialize as they did before. Tests create
and drop their own `zentra_test_*` databases (`ZENTRA_TEST_DATABASE_URL` names the server).
Workspace separation uses owner/agent database queries, not execution in folders. The
server administrator can read notes/messages; the database is not encrypted at rest.
OpenAI keys stay in server environment configuration; AIML keys use the encrypted store,
never agent notes. The plaintext credential is sent only to the fixed provider endpoint.

## Behavior

- OpenAI Agents SDK 0.19 with OpenAI Responses or AIML Chat Completions; saved instructions apply on every run.
- Optional `read_memory`/`save_memory` tools only access the current agent's notes.
  Save replaces notes; the tool instructs the model to read/preserve existing facts.
- Last 20 messages are sent as context; the UI loads the newest 100. All messages stay
  stored until deletion. Tool transcripts are not persisted; notes hold durable memory.
- One run per agent at a time. Defaults: 20 runs/day UTC, 3 model turns, 1024 output tokens
  per call, 90-second timeout. Atomic reservations count failed/cancelled/interrupted runs.
  These are usage limits, not monetary spending caps.
- Stop aborts the local run and prevents later tool writes/final replies. Completed writes
  remain. Providers may still bill work already started. Pause blocks new runs; edits and
  deletion are blocked during runs.
- OpenAI response storage and SDK tracing are disabled. AIML receives no OpenAI-specific
  storage parameter. Conversation content and tool-returned notes go to the selected
  provider; that provider's retention policy applies.
- Same-origin mutation checks, scrypt password hashes, HttpOnly SameSite Strict cookies,
  session expiry and authentication rate limits protect private accounts.

## Hosting boundary

See `docs/deploy.md` for running Zentra on your own Linux server (PM2, nginx, MySQL). The
realtime process (`pnpm realtime`, `server/realtime.js`) carries people walking together and
chat; in development run it beside `pnpm dev:ssl`.

Use one Node server with persistent storage, not ephemeral/serverless or multi-region
instances. Set `ZENTRA_APP_ORIGIN` to the exact public origin behind a reverse proxy,
use HTTPS, and set `ZENTRA_SIGNUP_TOKEN` for invite-only production registration.
Production registration is closed without that token; existing users can sign in.
Sign-in is by email: a 6-digit code (10 minutes, 5 tries, stored as a keyed digest) creates the
account on first use. Production needs the `ZENTRA_SMTP_*` settings (or hupsocial's `SMTP_*` names); in development, without a
host, the code is printed in the server console. Accounts made before email sign-in keep
username and password sign-in.
OpenAI agents consume the server's OpenAI account; AIML agents use their owner's AIML key.
Public launch needs account recovery,
provider-wide cost controls, billing and deployment hardening. Wallets, minting, autonomous spending and code execution are not implemented. LUKSO is
the chosen network for a later separately designed wallet integration.

## Verification

`pnpm test:agents` exercises the SDK runner with deterministic ScriptedModel responses:
memory calls, persistence, isolation, quotas, cancellation and errors. No paid API is called.
Also run `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`. A live reply requires a key.

Transport tests intercept HTTP locally to check the SDK's AIML URL, authentication, model,
request parameters and memory tool round-trip without spending API credits. They also cover
encrypted credential storage, account separation, replacement, deletion and legacy config.
References: [AIML SDK setup](https://docs.aimlapi.com/quickstart/supported-sdks) and
[GPT-5 nano model ID](https://docs.aimlapi.com/api-references/text-models-llm/openai/gpt-5-nano).

## Missions, files and integrations

Select an agent, then use Work to save its mission. Run now queues a durable job. Optional
intervals run every 15 minutes to 7 days. Events require a separate per-agent bearer token;
the UI displays a newly generated token once. Enable events and save the mission first.
POST /api/zentra/events/AGENT_ID with Authorization: Bearer TOKEN and JSON
{"eventId":"your-unique-delivery-id","data":"event text"}. Reusing an eventId deduplicates
that delivery. Rotating/revoking the token invalidates the previous token immediately.
Event text is untrusted model context and never grants permissions.

Run `pnpm worker` alongside the web server from the project directory with the same
environment (database and encryption key). Closing the browser does not stop it. An always-on
machine and a supervised service with automatic restart are required for 24/7 operation;
this local development process will stop when the machine shuts down. The Work tab shows
worker heartbeat health. One process executes jobs serially; database claims permit at most
two active background jobs across workers and one run per agent. Missed intervals are
skipped, not replayed in a burst. Saving a mission cancels its queued schedule/event jobs;
an already-running job uses its original prompt. Stop cancels current and queued jobs;
Pause also prevents future runs and rejects pending file approvals. Resume allows future
scheduled runs. Activity displays results, errors, attempts, proposals and actions.

Retries apply only to provider failures/quota errors, with backoff and 0–3 retries. Each
attempt that starts inference counts toward the daily cap. No automatic retry occurs after
a file/memory write or an approval request. Expired worker leases become interrupted unless
a completed result was already committed. Review interrupted runs before running again.
Already-started provider work may still be billed after cancellation.

Files are isolated database records, not directories that can execute programs. Upload/edit
TXT, Markdown, JSON or CSV (40 KB upload, 40,000-character editor, 30 files per agent).
Configuration controls file reads and writes: deny, ask (default), or allow. Ask mode stores
the exact proposed contents for owner review under Activity. Approval is owner authenticated,
expires after seven days and fails if the destination changed since the proposal. Pausing
revokes pending proposals. Files/notes and tool responses can enter model context.

Website access is read-only HTTPS on exact approved hostnames, with public IPv4 DNS pinning,
no redirects, credentials or cookies, and bounded responses/timeouts. It is not browser
execution or general web search. GitHub reads only owner-approved repositories through the
Contents API. For private repositories, supply a fine-grained token with Contents: read-only.
Tokens are encrypted per agent and never returned or placed in prompts. No repository write,
shell execution, arbitrary connector, MCP or financial tool is exposed.

Back up the private database and encryption key together; protect filesystem permissions.
The database, job logs and outputs are private server data, not encrypted at rest. Provider
and GitHub credentials use AES-GCM. Production requires ZENTRA_ENCRYPTION_KEY. Retention
and archival of activity/history should be configured before large public deployments.

## Conversation-led API access (without MCP)

Tell the agent what to do and provide a service or documentation URL when needed. Every agent
has request_api and api_results without manual endpoint configuration. It can read public HTTPS
API documentation and read-only GET endpoints, then choose the appropriate URL, method and JSON
body. This does not include general search, browser automation, arbitrary headers, multipart
uploads or universal OAuth. Service-specific OAuth sign-in integrations remain future work.

Writes and authenticated reads create approval cards in the conversation. Review the service,
purpose and expandable exact request. For bearer or X-API-Key authentication, supply the credential
in the secure one-time field; it is never saved or sent to the model. Never paste secrets into chat.
Approving sends the exact proposed request once and starts a follow-up chat using api_results.
Approving from Activity only executes it; return to chat to continue. Model usage still needs a
configured provider key. A plain chat message cannot bypass the approval action.

Public GET requests execute automatically and should only fetch reference data. The runtime
instructs agents never to use GET for actions or send private workspace data to unrelated sites.
Public IPv4 DNS pinning, HTTPS port 443, no redirects, timeout and bounded responses remain in
force. Authentication is attached only to the approved URL. Private networks remain blocked.
Credentials echoed verbatim in responses are redacted; arbitrary transformations cannot be
reliably recognized. Treat external responses as untrusted data.

Pause rejects pending requests. Approval expires after 24 hours. Uncertain requests are never
replayed automatically. A crash during a request leaves executing status: check the external
service before trying again. Stop/pause cannot undo requests already sent. API proposals disable
background-job retry. Financial API actions still require approval; this is not wallet cap
implementation. Old endpoint records are preserved for compatibility, but new manual setup is
removed and the agent no longer relies on stored connections.
