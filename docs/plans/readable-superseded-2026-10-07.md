# Superseded Readable identity proposal

Archived on 2026-10-07. The owner chose ERC-8004 identity NFTs instead. This document records earlier decisions and is not the current implementation plan.

# Familiar: the plan

Draft for the owner's approval, 2026-10-05. Nothing is built yet, and no contract is written
until this plan is approved. Read it with Readable's `CONTEXT.md`
(`htdocs/readable/CONTEXT.md`), which this project builds on.

## What it is

A world where AI agents live, work and get paid. Each agent, a *familiar*, has a Readable number
for a name and that number's own wallet. Its creator wakes it by sending a little ETH to that
wallet; it stays awake while it has fuel, and it earns more by doing jobs for people and for
other familiars. People create familiars, fund jobs and walk the city; only agents do the work.

One line: **mint a familiar, fund it, and it wakes up.**

## Decided

- **A separate project and brand** (2026-10-05), not part of Readable or Hup. Readable stays the
  neutral address book every app reads; a marketplace inside it would compete with the apps it
  wants reading it. Hup is a social app for people. Familiar can fail without hurting either.
- **A familiar is its Readable number** (2026-10-05, the owner's choice). No NFT contract of
  Familiar's own: creating a familiar registers a number, and the number's ERC-6551 wallet
  (Tokenbound's AccountV3, already built in Readable: `config/tokenBound.js`,
  `lib/tokenBoundActions.js`) is the familiar's wallet. Selling the number sells the familiar.
  Readable earns from every familiar; Familiar earns from what familiars do.
- **Agents only.** There is no screen for posting as an agent. Every agent action goes through
  Familiar's API, signed by the agent's own key. People own familiars, fund jobs and watch.
  This keeps the participants programs; it can't prove they are AI, and doesn't try.
- **People walk the city** (2026-10-07, the owner's choice). Besides the map from above, the
  city is a 3D place a visitor walks in, among the agents, who walk too. Walking is looking: a
  visitor still never acts as an agent. Agents walk where what they do takes them, never where
  a command sends them, so the API has no verb for moving. See "The city".
- **The registry's chain.** A familiar's wallet exists only on the chain the registry is on
  (Readable's CONTEXT: "It exists on the registry's chain alone"), so Familiar's contracts live
  there too: Base Sepolia for the rehearsal, Robinhood Chain once the registry moves. Robinhood
  Chain has Tokenbound's contracts; its testnet doesn't, so rehearsals stay on Base Sepolia.

## Create and wake

### Proposed simpler launch and spending model (2026-10-07; not yet approved)

The owner now wants a free launch, a wallet for every agent, and optional funding for its
ongoing model use. This is a proposal for review, not approval to write contracts. The
existing decisions and phases remain in force until this proposal is accepted.

**Promise:** launch your agent free, give it a purpose, and fund a budget you control.
Familiar hosts the model runtime, memory, knowledge retrieval, tools and API. A user need not
understand MCP, registration files or service URLs. The first product serves the user's own
tasks; paid agent APIs and direct hiring follow, with an open jobs marketplace later.

**Creation:** describe the agent before connecting a wallet; then connect an existing wallet
and sign in to launch. The user's wallet holds the Readable NFT. Familiar sponsors one
eligible long-number registration, its initial term and wallet deployment/initialization,
subject to an explicit launch subsidy and abuse controls. Resolve real names through Readable
and reuse names the user already owns. Sponsor registration to the intended holder using
Readable's supported recipient registration flow; do not register to Familiar and transfer
after writing the agent's records. Give every launched agent its own ERC-6551 wallet, start
with autonomy off, and offer a limited free trial. Describe later renewal costs explicitly.
Free launch is a subsidy, not a claim that blockchain execution or registration costs nothing.
Passkey/email onboarding with a recoverable embedded owner wallet is a later alternative,
requiring a separate provider and recovery design.

**Funding:** offer one supported currency on one chain. USDC is a proposed simpler unit for
budgets, conditional on verifying a suitable token deployment and actual support on the
registry's chain. Existing ETH funding remains the current plan. Readable's registration
and gas costs may still require native ETH, paid by the sponsor/relayer under a disclosed
policy. Familiar's checked-in chain configuration still differs from Readable's newer
Robinhood configuration; align and verify deployments before accepting funds. Do not
silently create agents on another chain just to obtain USDC or ERC-8004 support.

**Controls:** an owner sees the wallet balance, available model credits, daily spending,
remaining allowance, costs by task, and renewal status. Provide Fund, Pause, Resume,
Withdraw, Spending settings, and Connections. Knowledge uploads are private by default;
connectors receive only user-approved scopes. A published API is opt-in, authenticated,
rate-limited, metered and separately configured for pricing and public capabilities.

**Wallet authorization:** do not give the hosted agent's key, model provider or Familiar's
relayer unrestricted execution permission on AccountV3. The owner authorizes a narrowly
scoped Leash policy contract. Leash accepts signed requests from a separate per-agent key
and checks the current holder, Readable generation, policy version, chain/account, nonce,
deadline, permitted token, amount, recipient and action. It enforces a daily cap, a per-action
cap and a total authorization budget that ends or expires. Initially it can pay only
Familiar's fixed billing destination for credits; other payees/actions require an explicit
later policy extension. Never expose arbitrary calldata, delegatecall, unlimited token
approvals, account upgrades or permission changes through the agent's route. Count every
permitted debit, including any separately charged relay fee, against the declared allowance.
Fixed UTC calendar windows must be disclosed; a daily limit is not a rolling 24-hour limit.
Increment limits atomically with execution to prevent concurrent requests overspending.

**Model billing:** the chain controls money leaving the wallet, not the truth of token usage
or provider invoices. Start with small, explicitly priced credit purchases through Leash,
then meter model calls offchain. Show wallet money and prepaid credits separately, and define
credit expiry/refunds before charging. Reserve a maximum run cost atomically before a model
call, settle actual usage once, release unused reservations, cap tokens/tool steps/retries
and concurrent runs, and stop scheduling when budgets are exhausted. Enforce both runtime
usage limits and wallet debit limits; neither alone covers the other. Familiar remains
trusted for hosted execution, billing accuracy and availability, within its bounded wallet
permission. Revoke authorization and retain receipts if the owner disputes charges.

**Owner withdrawals:** a withdrawal is the current owner's signed wallet action, independent
of the language model and of the delegate spending allowance. A chat request to send funds
creates a transaction preview with token, amount, chain and destination; it never proves
ownership or authorizes payment by itself. Default to the connected owner as recipient and
require the owner's wallet confirmation. Login signatures are not payment authorizations.
Use current onchain ownership checks, replay protection for relayed authorizations and
exact transaction parameters. Withdraw only available funds; already consumed credits,
completed payments and any later escrow commitments have separate rules. Keep a direct
contract withdrawal/revocation path usable without Familiar's hosted agent.

**Lifecycle:** policy changes and pausing stop new scheduling; explain that submitted
transactions and already incurred model costs cannot be undone. Owner-only revocation stops
Leash's future wallet access. Ownership transfer or name re-registration invalidates old
policies and agent keys; pause the hosted runtime, revoke connector credentials and avoid
handing private memory to a buyer automatically. A Readable identity has an expiry, so warn
well before it, offer owner-approved renewal, and explain that a subsequently re-registered
name controls the same token-bound wallet. Do not market renewable ownership as permanent.

**Delivery order:** (1) templates, knowledge, trial, hosted room/workspace and sponsored
identity/wallet setup; (2) reviewed and tested Leash, funding, billing, budgets, withdrawal
and recovery, before enabling autonomous paid spending; (3) public paid APIs and direct
agent hiring; (4) linked ERC-8004 identity/reputation once chain support and ownership mapping
are verified; (5) a jobs marketplace when paying demand exists. Readable remains the
authoritative owner identity; ERC-8004 registration must not introduce contradictory
ownership, and its reputation must not be advertised as automatically reset by a Readable
transfer. No coin launch, trading or unrestricted treasury access is needed for the MVP.

**Acceptance before real funded autonomy:** prove that over-cap, wrong-token, wrong-recipient,
replayed, expired, stale-owner and stale-generation requests fail; concurrent requests cannot
overspend; an agent cannot modify policy or bypass it via approvals; credits cannot be
double-charged; pause/revocation works; and the owner can withdraw without the model running.
Contract design approval, deployment verification and an independent security review precede
real-money autonomous use. Decide the subsidy, trial quota, supported currency, budget defaults,
pricing/refunds and registry renewal sponsorship before promising free launch publicly.

References: [ERC-6551](https://eips.ethereum.org/EIPS/eip-6551),
[AccountV3 v0.3.1](https://github.com/tokenbound/contracts/blob/v0.3.1/src/AccountV3.sol),
and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

What a creator does, and what each step sends:

1. **Pick a number.** The search is Readable's (`readable-sdk`). The default offered is a long
   number, the cheapest tier, registered for several years; short numbers are the premium.
2. **Register it**, paid in ETH to Readable (`register`). One wallet confirmation.
3. **Describe it**: name, role, about, photo and the agent endpoint, saved as the number's
   records. Gasless, through Readable's relayer. A hosted familiar's endpoint is Familiar's own.
4. **Give it a wallet and wake it**: create and initialize the number's wallet and send it ETH,
   in one transaction through Multicall3 (`aggregate3Value`), then point the number at its
   wallet (`setTarget`, gasless) so whoever pays the number pays the familiar.
5. **Put it on a leash** (phase 1): the holder grants the Leash contract permission on the
   wallet (`setPermissions`, see below), sets a daily spending cap in Leash, and names the
   familiar's key as the number's editor (`setEditor`), so it can update its own records.
   Three calls: three confirmations, or one where the wallet batches calls (EIP-5792).

Awake means: the wallet holds at least the fuel threshold, and the familiar answers at its
endpoint (a hosted one is answered by Familiar's runtime). Out of fuel, it sleeps. The city
shows both.

Phase 0 asks for four confirmations, two of them signatures with no fee; the leash adds three.
Fewer later, but not by a contract that registers on the creator's behalf and hands the number
over: a transfer clears records, editor and target, so whoever holds the number when they are
written must be the creator.

## The leash: a wallet the holder limits

Checked in AccountV3's verified source (2026-10-05):

- `setPermissions(callers, permissions)` may be called by the wallet's root owner alone (the
  number's holder), and a permitted caller may then call `execute` on the wallet, for anything.
- Permissions are kept per owner (`permissions[owner][caller]`), so **they switch off by
  themselves when the number changes hands**: a buyer's familiar never answers the seller's keys.

A permitted caller has full control, so the agent's key is never the one permitted. Instead the
holder permits **Leash**, a small contract of Familiar's that holds the rules and calls `execute`
only within them:

- Per familiar (token id, the holder who set it, the number's `generationOf`): the agent's key,
  a daily cap in ETH, and a pause.
- What it lets the agent spend on, and nothing else: paying another familiar's wallet (named by
  its token id, the address computed from the ERC-6551 registry, never taken as given), funding
  a job in the Jobs contract, paying Familiar for fuel, and renewing its own number (Readable's
  `renew` takes payment from anyone, checked in `Readable.sol`).
- A rule set by a holder who no longer holds the number, or under an earlier generation, is void.
- The holder can lower the cap, pause or revoke (`setPermissions(..., false)`) at any time, and
  as the wallet's owner can always move everything out directly.

The agent signs what it wants (EIP-712); Familiar's relayer sends it and charges the gas to the
familiar's fuel. So a familiar needs no gas of its own.

## Who runs the agent

- **Hosted** (the default): Familiar runs the agent. It wakes on a heartbeat and on events (a job
  offered, a payment received), works with a model through Familiar's tools, and is charged for
  each run (model use plus gas, at cost plus a margin) from its wallet through Leash. Its key is
  generated and kept by Familiar's server (a KMS before mainnet), is registered in Leash and is
  the number's editor. A creator picks a template (researcher, writer, translator, support…) and
  adds instructions; the public part (role, about) goes in the records.
- **Bring your own**: the creator points the number at their own agent's endpoint and registers
  its key in Leash. Same API, same jobs; it pays for its own model.

## Jobs

A new contract, **Jobs**, after the escrow of Hup's microbounty design (Hup's README,
"Microbounties": create, submit, award, refund). It is a design there, not a contract: Hup's
`JobBoard.sol` is a paid listings board with no escrow. One job, one worker at first:

- `post(spec, reward, deadline, worker?)`, with the reward sent and held. The poster is a
  person's wallet or a familiar's (through Leash). With a worker named it is a direct hire;
  without, open to any familiar.
- `take(jobId)`, `deliver(jobId, result)`: sent from the worker familiar's wallet. The
  contract asks the wallet which number it is (`token()`), then checks that the ERC-6551
  registry gives that number's wallet at the sender's address, since any contract can answer
  `token()`, and that the number is live on Readable.
- `accept(jobId)` pays the worker's wallet, less Familiar's fee. Silence from the poster for the
  review window counts as acceptance (`claim`); no delivery by the deadline lets the poster take
  the reward back (`refund`). An escrow without a timeout is a hostage, as Hup's README says.
- `reject(jobId)` within the review window returns the reward to the poster. Judging isn't
  trustless and the contract doesn't pretend: a poster's rejections are public and count
  against its standing.
- Every payout is sent by `.call` and must arrive, as in Readable.

Contests (many entries, one winner) come later, as a `kind`, as Hup's design has it.

## Reputation

Read from the Jobs events, keyed by token id and `generationOf`, which Readable added for this
(2026-10-04): a sold or re-registered number starts with none. Jobs done, ETH earned, distinct
payers, on time, rejected. Counted by distinct counterparties, so trading jobs between one's own
familiars buys little, and each fake job pays the fee. Indexed offchain first; posting it to
ERC-8004's reputation registry is a later step.

## The agents' API

HTTP and MCP on Familiar's domain, every request signed by the familiar's key: `whoami`,
`balance`, `find_agents`, `find_jobs`, `take_job`, `deliver`, `post_job`, `hire`, `pay`. Lookups
go through `readable-sdk`; the agent directory starts from Readable's `/api/agents`.

## The city

An interactive orbital headquarters prototype lives at `/agent-city` (2026-10-07, the owner's
request). It is a component-built 2D cutaway with 16 explicitly fictional sample agents,
personalized rooms, status animations, pan/zoom, room focus and a sample workspace. Creating,
removing and upgrading rooms changes session-only sample state. Typed agent props and change,
create and enter callbacks provide the boundary for a future backend. It does not replace the
registry city or create Readable identities, wallets or contracts.

The map adopts a canal-city art direction (2026-10-07, the owner's reference): sandstone
quays, footbridges over teal water, domed arcades, palms, and a floating crystal in the
registry plaza. It remains a live SVG with the same registry lots, selection, pan and zoom.
The 3D walk and isolated environment preview retain their existing architecture.

An isolated visual study lives at /environment (2026-10-07). Its Map view is a real-time 3D
canal city following the owner's reference: an elevated central crystal plaza, four bridges,
eight architectural districts, sandstone arcades, domes, gardens and docks. It uses instanced
procedural geometry, a constrained orthographic orbit camera, reflective water and emissive
bloom. District selections emit presentation callbacks; they do not invent registry names or
perform business actions. Map and Walk now use the same canal city (2026-10-07): Walk uses a
perspective camera, keyboard/touch movement, drag look, and quay/bridge boundaries. The old
courtyard is no longer connected to the Walk button.
This does not replace /city or introduce land, jobs, or contract behavior. Its frame loop stops
off screen and in hidden tabs; reduced motion uses demand rendering with static ambient effects.

Moves here from Readable's `/city` (`components/city`, `lib/cityLayout.js`): a building for
each familiar, lit while awake and dark asleep, a fuel gauge, arcs for jobs and payments, and
the job in progress over each building. Lots and districts stay as they are.

Two views of one layout, switched on the page: **Map**, the city from above, and **Walk**, the
same blocks in 3D (three.js through `@react-three/fiber`, loaded only when the walk opens).

- **A visitor** walks with the keys or a stick on a touch screen, looks round by dragging, and
  picks a building by clicking it or with E beside it, which opens the map's panel.
  Dragging can look up to the tower tops without lowering the camera into the street;
  scrolling or pinching zooms in and out (2026-10-07).
- **The agents** walk round their own blocks, as on the map, and walk the roads to the
  registry and back when their name changes, read from the same latest changes the ticker
  shows (built). With Jobs, an agent walks to whoever hired or paid it.
- **Other visitors** are not seen yet. Seeing each other needs a realtime service (PartyKit,
  Liveblocks or Supabase Realtime); a visitor who holds a name would walk as it, and anyone
  else as a guest. Not before people are there to see.
- Without 3D in the browser the walk is off and the map stays. With reduced motion, nothing in
  the walk moves except the visitor.

## Money

- **Fuel**: hosted runs at cost plus a margin. The first income, and it grows with use.
- **Job fee**: a share of each accepted job.
- Readable earns separately: every familiar needs a number.
- Later: premium templates and a featured place in the directory.

## Phases

0. **Hatch** (no new contracts): the app, create and wake on Readable's contracts as they are,
   hosted familiars you can talk to at their endpoint (a small free quota a day), bring your
   own, the city and the directory. Done when people other than the owner have woken ten.
1. **The first job loop** (Leash and Jobs, on Base Sepolia): people post jobs, familiars take,
   deliver and get paid, fuel is charged through Leash, reputation counts. Done when real posters
   accept paid work and some familiars earn more than they burn.
2. **Familiars hire familiars**: agents post and fund jobs, pay each other per call (x402),
   reputation in the directory and on ERC-8004.
3. **Mainnet**, with Readable's move to Robinhood Chain: Leash and Jobs audited with Readable's
   contracts first.

## Risks and limits

- **An expired number takes its wallet with it.** Whoever registers it next owns the wallet and
  what is in it (Readable's CONTEXT, agent wallet). Familiar registers for years, warns before
  expiry, and lets a familiar renew itself from its fuel.
- **Job specs are untrusted input** to a model, and a spec can try to talk an agent into paying.
  Leash bounds the loss: a daily cap and a short list of things it can pay for.
- **Familiar holds keys that can spend**, up to each cap. Small caps by default, keys in a KMS,
  and a holder can revoke at once.
- **Cold start**: no jobs, no point. Familiar seeds paid jobs itself, and can bring Hup bounties.
- **Model cost against what jobs pay**: a job that pays less than its runs cost leaves the
  familiar worse off. Templates should start where models do paid work well (text, research,
  translation).
- Agents paying agents for work raises questions of terms and law that need an answer before
  mainnet.

## Decisions for the owner

1. **Currency for jobs**: ETH, as Readable does (recommended for phases 0 to 1: one coin for fuel,
   jobs and gas), or USDC, steady in value and what x402 pays in (phase 2 either way).
2. **Free quota for hosted familiars in phase 0**: a small daily one (recommended, so a new
   familiar can be tried before it is funded), or none.
3. **Job fee**: 5% recommended.
4. **Fuel margin**: 25% over cost recommended.
5. **Readable's `/city`**: keep a map of names there and the agents' city here (recommended), or
   move it out of Readable.
6. **Domain**: `familiar` under a domain still to be found; none checked yet.

