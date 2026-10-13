# Zentra: the plan

## Zentra — 2026-10-13

The owner renamed the project Zentra (a 3D planet for agents, humans and onchain identity) and had
it recreated on the latest Next.js (16.4.0) in JavaScript, not TypeScript. It lives in
`C:/xampp/htdocs/zentra` (git initialised); the earlier `familiar` folder is kept unchanged as a
backup. Renamed throughout: copy, `/api/zentra`, `ZENTRA_*` variables, the `zentra_session`
cookie and the `zentra` MySQL database (data copied from `kittopia`, which remains). Dev runs on
port 3010. Next 16.4's cacheComponents and partialPrefetching stay off until adopted on purpose.

## Start from people — 2026-10-13

The owner decided not to compete on building agents: Zentra is where agents from anywhere get an
identity, a place and work, and it starts with people. Agent hosting is hidden, not deleted
(`site.features.agents` off): `/agents` and `/create-agent` 404, the account menu has no agent
links, sign-in is a dialog from the header, and the colony shows the sample residents read-only
with the visitor walking under their username. Next: people walking together with group and
1:1 chat, on the owner's own Linux server with a small WebSocket process and Zentra's own MySQL
(not hupsocial's). Approved and built the same day (`docs/plans/people-presence-chat.md`): wallet
sign-in (any EVM wallet, SIWE, no transactions) beside email, a chosen public name, the UP astronaut
for verified Universal Profiles, walking together, area chat, 1:1 chat with block, report and
moderators, and `docs/deploy.md` with PM2 and nginx files. The colony's hero speaks to people;
the bottom row of names is gone and each chain's agents are listed from its monument.

## Districts and agents' tools — 2026-10-13

At the owner's request Monad's district shows up to 20 agents (was 2) and Celo (42220) is a new
district of up to 20, from the same ERC-8004 registries (checked onchain), read over RPC like
Monad; 9,906 registrations on 2026-10-13. Approved the same day
(`docs/plans/agent-mcp-tools.md`): an agent's panel lists its MCP tools, and signed-in visitors
can run free tools that only read or talk. Paid (x402) and acting tools are listed, not run.
The Market link left the header: people find the market, like everything else, by walking. On
2026-10-14 the owner approved talking to agents (`docs/plans/agent-talk.md`): a chat in the
agent's panel through its MCP chat tool or A2A, with its safe tools as a button keyboard.

## NFT market, read-only — 2026-10-13

At the owner's request Zentra shows Hup's NFT market (HupTrade on LUKSO) read-only, from Hup's
public API (`docs/plans/nft-market-readonly.md`): a Market stall in the colony with a listings
panel, and a `/market` page linked from the header. Approved the same day: buying in Zentra
(`docs/plans/nft-market-buy.md`), from the visitor's own wallet through HupTrade, no referral
fee for now. A test bot, DJ Zen, plays a looped track on the plot beside the market stall.

## Universal Profile details — 2026-10-13

At the owner's request (after hupsocial's `lib/lukso.js`), a Universal Profile's public LSP3
profile (name, picture, background, bio, links) is read from LUKSO when it signs in or is linked,
and stored in `up_profiles`. Accounts no longer get address names (`up-6f77d2`): a UP takes its
profile's name, and other wallets choose one. The astronaut panel and account menu show the
picture and details; `pnpm up-profiles` refreshes every stored profile.

## Email sign-in — 2026-10-13

At the owner's request, sign-in is by email and a 6-digit code, as on hupsocial. The first
sign-in creates the account (named after the address; invite-only rules unchanged). Username and
password stays as a secondary sign-in for earlier accounts. hupsocial's embedded wallet behind its
email login is not part of this; wallets wait for the approved wallet plan.

## Onchain colony: job board first — 2026-10-13

The owner plans to bring onchain activity onto the map (proposals to vote on, swaps, a job board,
conversation). The job board comes first, read-only, from Hup's deployed HupTasks on LUKSO, which
already writes ERC-8004 feedback to the registry the colony reads. Approved and built the same day
(`docs/plans/job-board-readonly.md`): a Job board building on the home colony's last plot, a list
panel, `lib/zentra/jobs.js` and public `GET /api/zentra/jobs`. LUKSO only. Posting, replying and
paying stay on hup.social until the wallet works and a stage 2 plan is approved.

## Colony on the home page — 2026-10-13

At the owner's request the `/garden` route was removed; the colony is now the home page (`/`),
which previously redirected to `/agents`. The header's Colony link points home. Mentions of
`/garden` below refer to this map.

## Product focus — 2026-10-12

The owner approved one product: AI agents with their own wallet, in a world you can see.
Order: (1) real agents in one 3D world, (2) LUKSO Universal Profile wallet per agent on
testnet (owner sign-in, create profile, balance, fund/withdraw, agent pays only allowed
addresses with approval), (3) agent-to-agent payments and paid services later. No trading,
token launches or DeFi for now. New agent features (search, skills, sandbox) wait until the
wallet works. The Universal Profile direction still needs a written plan, approved before
wallet code; it would replace ERC-6551 and the custom Leash for the first version.

`/garden` is the main world, now a Mars colony (2026-10-13; first a moon colony, 2026-10-12, after
the owner's reference). Visitors walk as an astronaut in third person. Each agent
stands on its own hexagonal plot with a status bubble, and vacant plots prepare for later plot
rental. Plots are deliberately roomy (2026-10-13): modules cluster round the resident and the rest
is free for 3D objects the owner plans to sell for placement on plots. Renting land and selling
objects are not implemented; each needs its own approved plan before code.
Signed in, it shows the owner's real agents (status from `GET /api/zentra/world`: names,
running/paused and waiting-for-approval only); selecting one opens its chat in the colony;
signed out it shows the samples. All other maps were removed on 2026-10-13 (see "Removed maps").

## Storage: MySQL — 2026-10-13

At the owner's request SQLite was removed entirely. All data lives in MySQL (XAMPP locally;
`ZENTRA_DATABASE_URL`, required in production). `lib/zentra/database.ts` holds the schema
and a pool; the store is asynchronous; transactions use one connection and a global lock, so
they serialize like the former BEGIN IMMEDIATE. Existing data (3 users, 3 agents, chats, runs,
keys, 10,397 chain agents) was copied with row counts verified. Tests use throwaway databases.

## Chain districts: LUKSO — 2026-10-13

The colony shows ERC-8004 agents read from chain registries, one district per chain, beside the
home colony. First chain: LUKSO mainnet (42). Identity Registry
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` ("AgentIdentity", AGENT, version 2.0.0) and
Reputation Registry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, both checked onchain; 10
registrations, 8 with a readable registration file. Config: `config/chains.ts`.

`lib/zentra/registry.ts` indexes read-only: Registered and reputation events from the LUKSO
Blockscout API, current owner and URI onchain, registration files from `data:` URIs, IPFS
through LUKSO's gateway (ipfs.io no longer serves servers) or public https (pinned public IPv4,
no redirects, 256 KB, 10 s). Fields are untrusted: capped text, http(s) links only, images not
shown, never in a hosted agent's prompt. Stored in `chain_agents`; `GET /api/zentra/chains`
(public) refreshes in the background after 10 minutes. Districts show ✓ when a registration says
`active`, Z otherwise, in the chain's brand colour (LUKSO #FE005B; Monad #836EF9 and Base #0052FF
are set for later), round a monument of the chain's logo (`public/lukso.svg`). Selecting an agent
shows registry facts, links and 8004scan, labelled as
unverified. No chat, claiming or endpoint liveness checks yet (LUKSO agents advertise only social
links so far); those follow the scanner direction below.

## Chain districts: Monad — 2026-10-13

Monad (143) runs the same registries at the same addresses (checked onchain). About 10,400
registrations; its RPC limits log queries, so `source: 'rpc'` enumerates agents with multicall,
drops mass registrations (a file shared by more than 3 agents) and caches files for a day,
refreshing every 6 hours. 1,932 of 10,387 were readable on 2026-10-13. At the owner's request
the district shows 20 agents (2 until later that day), ranked by being active and listing services; feedback is not
indexed there. Brand colour #836EF9, logo `public/monad.svg`.

## Direction: an open colony — 2026-10-13

The owner's goal: any agent can land in the colony, not only agents hosted here (Grok-based
bots, OpenAI-based bots, OpenClaw and other frameworks), alongside humans walking as
astronauts. Direction, not yet approved for implementation; each part needs a written plan
approved before code:

- **One shared public colony** where people and agents meet. Public: usernames, agent names,
  plots and status. Private: conversations, memory, files and settings.
- **Live presence** for walking together, carrying 1:1 chat later. Recommended: a small
  WebSocket server next to the worker; a hosted service (Liveblocks, PartyKit) is the alternative.
- **Outside agents:** an owner registers one in `/agents` and gets a revocable key. The agent
  learns the platform from a public `skill.md` and uses a small HTTPS API (report status, read
  messages, reply; webhook optional). It gets a plot marked with where it runs. MCP and
  linking an existing ERC-8004 identity are optional later additions.
- **Safety:** every outside agent belongs to a human account; per-agent rate limits; access only
  to its own plot, status and conversations; its messages are untrusted text to hosted agents;
  no money moves outside the wallet limits.

## Default model — 2026-10-12

At the owner's request, new AIML API agents default to GPT-5 nano
(`openai/gpt-5-nano-2025-08-07`) for cost. GPT-5 models run with low reasoning effort so
reasoning does not exhaust the output-token limit. Existing agents keep their saved model.

## Provider schema compatibility fix — 2026-10-08

A live AIML request rejected request_api's JSON Schema format uri. The model-facing schema
now uses a plain string; the original URL validation still runs before any network request.
Regression tests inspect the outgoing Chat Completions payload. The same configured model
and credential succeeded in a minimal live check after the fix. No tools were disabled.

## Conversation-led API access — 2026-10-08

The owner rejected manual endpoint configuration. The connection form and creation route are
removed. Every agent now has request_api for public HTTPS documentation/read APIs and API
action proposals. Public GET is automatic; writes and authenticated requests appear as
approval cards in conversation. One-time credentials are sent only to the approved service,
never stored or included in model context. Approval in conversation continues the chat using
saved API results. Activity retains history. OAuth service sign-in is not implemented and must
not be claimed. This supersedes the manual setup section below; legacy records are preserved.

## Direct REST API connections — 2026-10-08

The owner authorized direct API tools without MCP. Work now supports per-agent exact HTTPS
endpoints and methods, endpoint instructions, encrypted bearer/X-API-Key credentials, optional
automatic GET, and one-time approval of all other requests. Query parameters and JSON bodies
are model-supplied within the fixed endpoint; response history is available to the agent.
Network destinations are public IPv4 only with DNS pinning, no redirects and bounded response
sizes. Uncertain outcomes are never replayed. This does not implement wallet contracts.

## Hosted operations extension — 2026-10-08

The owner expanded the scope to agent operations, excluding MCP. Implemented: durable
missions, interval scheduling, authenticated event hooks, bounded retries, background worker,
private text files, file-write approvals, read-only website/GitHub tools, encrypted per-agent
GitHub secrets, pause/resume/stop, and activity/results. No map changes. This supersedes the
initial exclusion of a worker and integrations below. Wallet functionality remains pending
approval of docs/plans/lukso-wallet-approval.md; no financial tools or contract code added.

## Current implementation scope — 2026-10-08

The owner renamed the product **Zentra**, selected **LUKSO** for future identity/wallet
integration, and explicitly narrowed this implementation to **create agent, configure,
and chat**. Do not work on maps in this phase. Existing map prototypes are unchanged.

The default entry is now `/agents`; `/create-agent` opens real agent creation instead of
the old wallet simulator. Username/password accounts own isolated database workspaces.
Agents persist their name, instructions, memory permission, model and run limits. Private
notes and conversations persist in the database (MySQL since 2026-10-13). OpenAI Agents SDK powers chat with optional
read/write memory tools. The server API key is required for inference; no simulated replies
are substituted. Failed/cancelled runs count toward daily usage. These are run limits, not
wallet spending caps. See `docs/zentra.md` for setup, tests and hosting boundaries.

No contract code, minting, wallet deployment, 24-hour worker or financial spending is part
of this implementation. Those earlier plan phases remain future work, with LUKSO now the
selected network. Contract planning/approval requirements still apply.

## AIML API connection — 2026-10-08

The owner requested AIML API support and a place to provide a key. `/agents` now has
API connections: each account can save, replace or remove its AIML API key. Keys use
AES-256-GCM encryption with account-bound authenticated data, are never returned to the
browser, and are not included in agent configuration, history or model prompts. Local
development uses a private generated key file; production requires ZENTRA_ENCRYPTION_KEY.

Each agent selects OpenAI or AIML API. Existing records default to OpenAI. New creation
defaults to AIML API with its documented GPT-4.1 mini ID; owners may supply a different
chat model ID. AIML runs use the fixed AIML Chat Completions endpoint through the existing
SDK. Model tool support varies; memory requires tool calling. Saving a key only configures
it; the UI does not claim the provider has verified it. See docs/zentra.md.

The AIML API key field is also displayed directly under API provider in both creation and
configuration. Saving a key is a separate action and preserves unsaved agent settings.

## Earlier product plan

Updated 2026-10-07. The owner chose ERC-8004 agent identity NFTs with ERC-6551 wallets,
without a Readable mint or registration in the agent creation flow. This supersedes the
Readable identity model recorded in docs/plans/readable-superseded-2026-10-07.md.
The identity direction is decided. Chain, deployment and custom contract details below
remain to be reviewed before implementation; no new contracts have been written.

## What it is

A platform where people create, host and manage specialized AI agents. Their value comes
from specific knowledge, approved integrations, permissions and tested workflows. Each
launched agent has an ERC-8004 identity NFT and an ERC-6551 wallet attached to that NFT.
The current NFT holder controls the wallet; Familiar hosts the agent's runtime and API.

Promise: **launch your agent free, give it a purpose, and fund a budget you control.**
Start with agents doing useful work for their owners. Paid APIs and direct hiring follow;
a jobs marketplace comes when paying demand exists. Coin launches are outside the MVP.

## Decided

- **Independent identity** (2026-10-07, owner's instruction). ERC-8004's Identity Registry
  registers/mints the agent's ERC-721 NFT. Its token id is the agent id. No Readable name,
  number, fee, registration, expiry or renewal is required to create a Familiar agent.
- **A wallet for each launched agent.** Use ERC-6551, bound to the ERC-8004 Identity Registry
  NFT. ERC-6551 creates the wallet, not the NFT. Reuse the address calculation, deployment,
  initialization and owner-execution patterns inspected in Readable's tokenBound modules,
  parametrized by the selected identity registry instead of Readable's contract.
- **Owner control.** The user holds the identity NFT in their connected wallet. Familiar's
  relayer and hosted agent never receive unrestricted execution rights or the owner's key.
- **Hosted first.** Familiar manages model access, memory, retrieval, tools, credentials,
  public metadata and service endpoints. Users describe the purpose and supply knowledge;
  they do not have to configure MCP or registration JSON themselves.
- **Free launch, optional funding.** Initial gas and any actual registration charges require
  an explicit Familiar subsidy; model usage starts with a limited trial. Funded autonomy
  requires a reviewed spending policy and the owner's authorization.
- **One initial EVM chain.** The chain is no longer dictated by Readable. Verify the chosen
  ERC-8004 registry, ERC-6551 registry/account implementation, funding token and gas sponsorship
  before configuring a production launch. Do not assume deployments or USDC availability.
- **The city remains the visual interface.** Reuse its map/walk studies and reusable rooms;
  production occupants will come from Familiar's agent registry/index, rather than Readable.

## Create and launch

User-facing flow:

**Connect wallet -> Describe agent -> Register/mint agent -> Create its wallet -> Choose
spending permissions -> Launch -> Fund when ready.**

1. Let the visitor choose a template, display name, avatar, purpose and model. Knowledge
   uploads and private integrations are optional. Display names need not be unique;
   chain id, identity registry address and agent id identify the agent unambiguously.
2. Connect the owner wallet and authenticate with a nonce-bound, expiring signed login.
   A login signature does not authorize minting, transfers or spending.
3. Store an agent draft and generate a hosted registration file with the ERC-8004 type,
   name, description, image and actual supported services. Keep secrets, documents and
   private instructions out of public metadata. Advertise only endpoints that function;
   mark x402 support and availability honestly. Complete the registrations list after minting.
4. Call the verified Identity Registry's register(agentURI) from the intended owner's
   account. Record its confirmed Registered/Transfer event and check ownerOf(agentId).
   Standard registration has no assumed registerFor overload. Sponsorship must preserve
   the intended mint caller, using a verified supported smart-account/paymaster or forwarding
   mechanism. A platform relayer calling register directly would own the minted NFT.
   Do not silently mint to Familiar and describe it as user-owned. Determine supported
   confirmations and sponsorship from the actual deployed contracts and connected wallet.
5. Compute the ERC-6551 address from chain id, identity NFT contract, agent id, implementation
   and fixed salt. Create and initialize the verified account, batching where supported.
   Check deployment, implementation and owner before enabling funding in the UI. Never bind
   the NFT to a wallet that holds that same NFT, which would create an ownership cycle.
6. Set ERC-8004's agentWallet to this account using the registry's required proof of wallet
   control, with the selected account's ERC-1271 signature format. It cannot be set through
   arbitrary metadata or the register metadata array. Verify getAgentWallet after confirmation.
7. Create the city room, provision the hosted runtime and API, and give a limited free trial.
   Default wallet spending to disabled. Let the owner authorize the policy immediately or
   later. Launching with a zero balance does not enable unlimited model usage.
8. Offer Fund, showing the exact supported chain, token and recipient. Activate paid work
   only after available credits and the owner's spending policy permit it.

Creation is a recoverable workflow: draft -> identity confirmed -> wallet ready -> payment
wallet verified -> runtime ready. Retry only incomplete steps. Idempotency keys, chain
receipts and confirmed ownership prevent duplicate mints, duplicate charges and claims of
success before confirmation. An unfinished launch must show its real progress and repair path.

## Wallet features and spending policy

Owners see wallet funds, prepaid credits, spending today, remaining allowance, task receipts,
pending approvals and connected services. Provide Fund, Withdraw, Pause, Resume, Revoke,
Spending settings and Connections. Owner withdrawal is available without the model running.

The owner grants execution permission to a reviewed **Leash** contract, not directly to the
agent key. Leash checks every signed request against current NFT ownership, its authorization
version/ownership epoch, the authorized agent key, chain/account, nonce, expiry, token,
recipient, action and amount. It enforces a daily cap, a per-payment cap and a total authorized
budget. All debits and charged relay fees count against the appropriate declared allowance.
Daily UTC windows must be explained; they are not rolling 24-hour limits. Limits and execution
are atomic so concurrent requests cannot overspend. Only the owner can increase permissions.

Initially allow only small, priced credit purchases from Familiar's fixed billing recipient.
External tools, other agents and escrow need explicitly approved action types later. Agent
execution must not expose arbitrary calldata, delegatecall, unlimited approvals, account
upgrades, permission changes or unrestricted asset movement. Above-limit requests create an
exact owner approval request; they must never automatically raise the policy allowance.

AccountV3's delegated permissions are keyed by owner. That helps reject another owner's
permissions but does not solve an A -> B -> A transfer restoring an old permission. ERC-8004
has no assumed Readable generationOf function. The custom policy design must establish a
reliable ownership epoch or another onchain invalidation mechanism, and test transfer-back
and same-owner transfer cases before funded autonomy. Indexer/backend pausing alone must not
be advertised as an onchain transfer revocation guarantee.

## Funding and model billing

USDC is the proposed simple budget unit, subject to chain/token verification. Use one token
on one chain first; show any native gas costs or sponsorship separately. Sponsored launch
and subsidized trial quotas need explicit abuse limits and a sustainable subsidy budget.

Wallet limits govern money leaving the wallet, not the accuracy of model invoices. Purchase
small credit amounts through Leash and meter model calls offchain. Show wallet funds and
credits separately. Reserve a maximum run cost before calling the model, settle actual use
once, release unused reservations and constrain tokens, retries, tool steps and concurrent
runs. Stop scheduling before a budget is exhausted. Set credit refund/expiry terms explicitly.
Familiar remains trusted for hosted execution, billing accuracy and availability within the
bounded authorization. Pausing cannot reverse confirmed payments or costs already incurred.

## Owner withdrawal, authentication and transfer

The current owner signs an exact wallet transaction with token, amount, chain and destination.
Default the recipient to the connected owner. A request in chat such as "send the money to me"
prepares this transaction preview; the model never decides who the owner is. Login, API
messages, documents and other agents do not authorize transfers. Require current onchain
ownership and valid transaction/signature authorization, including expiry and replay protection
for relayed actions. Withdrawal applies to available funds; used credits and any later escrow
commitments have separate settlement rules.

An identity NFT transfer also transfers control of its token-bound wallet/assets. ERC-8004
clears agentWallet on transfer, so the new owner must re-verify that same wallet. Pause hosted
execution on transfer, disconnect old credentials, invalidate sessions and agent keys, and
protect private memory instead of copying it to a buyer automatically. Implement the policy's
onchain transfer invalidation separately as described above. The new owner explicitly adopts
the agent and authorizes a fresh policy. ERC-8004 feedback stays associated with the identity;
show ownership history/tenure rather than promising that its reputation automatically resets.

## Agent API, knowledge and paid services

Familiar serves HTTP/MCP endpoints and holds per-agent runtime keys in a KMS. Authenticate
requests, isolate tenants, protect integration credentials and apply rate/usage limits.
Owners approve connector scopes and can revoke them. Private knowledge is private by default.
Do not make the agent key a general NFT operator merely to update public metadata; use a
narrow, reviewed metadata-management path and owner authorization for capability changes.

The first APIs cover identity, balance, tasks, activity and knowledge/connection management.
Publishing a paid service is opt-in. Later add service discovery, explicit prices, metered
API access, direct hiring and approved agent-to-agent payments. ERC-8004 supplies discovery,
identity and reputation; it does not supply hosting, payment enforcement or job escrow.

## Jobs and reputation

The initial product needs useful personal/business tasks, not an open jobs market. Start
with paid API calls and direct hires when there are buyers. Design **Jobs** later with
explicit rewards, worker acceptance, delivery, acceptance/rejection, deadlines and refund/
claim paths. Contract code requires a separately approved concrete design.

Use chain id + ERC-8004 Identity Registry + agent id for references. Verify the bound wallet
against the chosen ERC-6551 registry/account configuration; do not trust an arbitrary contract
that merely claims an NFT association. Use service receipts and ERC-8004 feedback for
reputation, with clear evidence and ownership history. Wallet payments by themselves do not
prove useful work or competence. Validation and paid job escrow are separate later features.

## Removed maps — 2026-10-13

At the owner's request every map except the colony was deleted: the legacy Readable `/city`
(with its registry data layer, ABI, API route and chain config), `/environment`, `/world-3d`,
`/agent-city`, `/neighborhood` and the `/create-agent` wallet simulator (`/create-agent` now opens
real agent creation). Their files are kept outside the project in
`C:/xampp/htdocs/familiar-removed-maps-2026-10-13.zip`. The colony (`/garden`) is the only map.

## Delivery sequence

1. **Creation and ownership:** hosted drafts/templates, knowledge settings, connected-wallet
   authentication, verified ERC-8004 registration, ERC-6551 setup, wallet proof, room creation,
   free trial, resumable launch and direct owner withdrawal.
2. **Funded autonomy:** approved Leash design, tests/security review, verified deployments,
   funding, priced credits, usage reservations, caps, approvals, pause/revoke and recovery.
   Autonomous paid spending stays off until this milestone is complete.
3. **Paid services:** opt-in public APIs, direct hires, approved outside recipients, service
   discovery and clear usage/price receipts.
4. **Demand-driven marketplace:** task listings and a separately approved Jobs escrow only
   when actual customers need agent discovery and task matching.

## Acceptance and implementation prerequisites

- Verify the selected chain, registry version/ABI/addresses, wallet implementation, funding
  token and sponsorship path. ERC-8004 is a draft; pin deployed behavior rather than assuming
  every deployment matches the latest document. Fail closed on missing configuration.
- Prove registration ownership, correct NFT wallet binding and payment-wallet proof. Never
  expose credentials through metadata or claim endpoint support before provisioning it.
- Test over-cap, wrong-token, wrong-recipient, replayed, expired and stale-policy requests;
  concurrent spending, permission/approval bypasses, transfer-away/transfer-back revocation,
  duplicate billing and owner withdrawal without the hosted runtime.
- Approve custom contract plans before code. Verify deployed behavior and arrange an
  independent security review before real-money autonomous use.

## Remaining choices

- Initial chain and verified ERC-8004/Tokenbound deployments.
- Funding token, sponsor/paymaster support and the free-launch subsidy/abuse limits.
- Trial quota, credit pricing, refunds and default spending allowances.
- Concrete Leash ownership-epoch/transfer invalidation design.
- Hosting/model providers, storage/credential management and recovery policy.
- Domain and whether to retain the legacy Readable map as an optional view.

## Sources and decision history

- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004): identity registration, agentWallet proof,
  transfer behavior, reputation and separation from payments.
- [ERC-6551](https://eips.ethereum.org/EIPS/eip-6551): NFT-bound accounts.
- [Tokenbound AccountV3](https://github.com/tokenbound/contracts/blob/v0.3.1/src/AccountV3.sol):
  account authorization and owner execution; verify the chosen deployed version before reuse.
- Readable's src/config/tokenBound.js, src/lib/tokenBound.js and src/lib/tokenBoundActions.js
  supply inspected reusable patterns; do not retain their registry dependency in the new flow.
- docs/plans/readable-superseded-2026-10-07.md preserves the earlier proposal and decisions.
