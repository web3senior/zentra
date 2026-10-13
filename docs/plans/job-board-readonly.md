# Colony job board, read-only — approved and implemented

Approved by the owner on 2026-10-13: Hup's contract, read-only, LUKSO only; to be improved later.
Implemented the same day. One change from the plan below: a task's current state comes from the
contract's `getTask` rather than from replaying `SlotsAdded`/`DeadlineExtended`/`TaskHiddenSet`;
logs still give the posted tasks, the payouts and how a task closed.

Stage 1 of the onchain colony (owner's direction, 2026-10-13): a Job board building in the colony
that shows bounties from Hup Tasks on LUKSO. Read-only. No contract code, no wallet connection, no
transactions and no money movement. Posting, submitting and paying are stage 2, which waits for
the wallet milestone and its own approved plan.

## What exists onchain (checked 2026-10-13)

- **HupTasks on LUKSO (42):** `0x232AD3137Ef5c3F1E3CE04248ab9C9729d3e987a`, `version()` 1.0.0,
  not paused. Its `reputationRegistry()` is `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, the
  ERC-8004 Reputation Registry the colony's LUKSO district already reads. An approval that
  carries a worker's agent id and a rating writes ERC-8004 feedback for that agent.
- **A task belongs to a Hup post.** The poster escrows `slots × rewardPerSlot` (plus a fee) in
  the native coin, an ERC20 or an LSP7. Workers submit by replying to the post, and each approved
  reply is paid one slot. After the deadline the poster reclaims what is unpaid. Sealed tasks
  encrypt submissions to the poster.
- **The task text is in the post,** not the task: Hup Core (`0xf6eeC4e32a532b23ACC56b72865e79c79877CEc8`)
  `getContent(postId, 0x0)` returns `metadata` as an `ipfs://` URI, a JSON document whose first
  `text` element is the brief. LUKSO's gateway serves it.
- **Volume is tiny.** The contract has 2 tasks in total (posts 5781 and 5880, translate and
  research, 5 LYX per slot, 5 slots each). Both are finished: one fully paid, one reclaimed. No
  task has given ERC-8004 feedback yet (every `agentId` is 0). **The board will open empty of
  open jobs.** It shows recent finished jobs so it is not a blank wall.
- The contract is not verified on Blockscout, so its logs come back undecoded; we decode them with
  the HupTasks ABI (copied from hupsocial).

## What visitors see

- A **Job board building** in the home colony, near the hub, using the same selection pattern as
  the chain monuments. Its sign shows the count of open jobs.
- Selecting it opens a panel listing jobs: the brief (first 400 characters, plain text), category,
  reward per slot with its token, slots paid and left, deadline in relative time (`Intl`), status
  (Open, In review after the deadline, Done) and a "View on Hup" link
  (`https://hup.social/networks/42/<postId>`). Open jobs first, then up to 10 recent finished ones.
- Workers who were paid with a rating show their ERC-8004 agent, linking to the colony's district
  agent when it is indexed there.
- Labelled like the districts: public onchain data, not verified by Zentra; briefs are untrusted.

## How it works

1. **Config, not literals.** Add `jobs` to the LUKSO entry in `config/chains.js`: the HupTasks
   and Hup Core addresses, the deployment block (8426057) and the Hup post URL pattern. Copy goes
   in `site.garden.jobs`. Building colours are new `--color-garden-*` tokens.
2. **Indexer** `lib/zentra/jobs.js`, alongside `registry.js` and with its safeguards: read HupTasks
   logs from the LUKSO Blockscout API from the deployment block, decode with the ABI, and apply
   `TaskPosted`, `SlotsAdded`, `DeadlineExtended`, `SlotPaid`, `TaskCancelled`, `TaskReclaimed`
   and `TaskHiddenSet`. Fetch each post's brief once through the existing IPFS path (256 KB, 10 s
   limits, capped text, http(s) links only, no images, never in a hosted agent's prompt). Hidden
   tasks are never shown.
3. **Storage** in `lib/zentra/database.js`: `chain_jobs` (chain, post id, poster, token, LSP7 flag,
   reward, slots, paid slots, deadline, category, sealed, closed reason, hidden, brief, block) and
   `chain_job_payouts` (chain, post id, reply id, worker, amount, agent id, rating). The token
   symbol and decimals are read once onchain for ERC20/LSP7 and cached.
4. **API:** `GET /api/zentra/jobs` is public and cached like `/chains`. It refreshes in the
   background after 10 minutes and returns open jobs plus 10 recent finished ones.
5. **Colony:** `Objects.jsx` gets the building, `JobBoardPanel.jsx` the list, reusing
   `ChainPanel`'s layout. The frame-loop rules are unchanged.

## Tests

Add to `tests/registry.test.js` or a new `tests/jobs.test.js`, using throwaway databases as the
other tests do:

- Decoding the recorded events of posts 5781 and 5880 gives Done (5/5 paid) and Done (reclaimed).
- Open, review and done are derived correctly at deadline boundaries.
- Hidden tasks are excluded.
- A brief over the limit, a non-IPFS URI and a gateway failure each degrade to no brief, never an
  error.
- Unknown token decimals hide the amount rather than guess it.

## Not in this stage

Posting a job, replying or submitting, approving, rating, paying, and agents doing jobs. All of
these need the owner's wallet (and for agents, their own wallet and spending limits). They come
in stage 2 after the wallet milestone, with a separate plan. Zentra writes no contract code for
either stage while it uses the deployed HupTasks; its admin and fees belong to Hup.

## Decisions for the owner

1. Approve the read-only job board as above.
2. LUKSO only, or also Base Sepolia, Celo, Robinhood and Arc, where HupTasks is deployed too
   (hupsocial config; not yet checked onchain)? Recommended: LUKSO only, matching the colony.
3. Is relying on Hup's deployed contract, and on hup.social for viewing and replying to a job,
   acceptable as Zentra's first job board?
