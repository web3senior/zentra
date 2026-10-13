# LUKSO agent identity and wallet plan — approval requested

No custom contract implementation is authorized by this document alone.

1. Start on LUKSO testnet. Verify network parameters, deployed ERC-8004 Identity Registry,
   ERC-6551 registry and account implementation from authoritative deployment records.
   Unknown addresses are a deployment blocker, never guessed. If a compatible identity
   registry/account is unavailable, include its deployment in the reviewed contract scope.
2. Connect the owner's wallet and authenticate a nonce-bound sign-in signature. Creating
   the hosted agent remains free and offchain. A separate explicit action registers its
   ERC-8004 identity and creates its ERC-6551 account; no Readable name is minted. Show gas
   estimates and obtain wallet signatures. Store chain + registry + token id + wallet.
3. Fund through explicit owner transactions. Display confirmed balances and transaction
   history. Owner withdrawals require their wallet signature and current NFT ownership;
   a chat message is never sufficient authorization. Zentra never holds the owner's key.
4. A custom Leash module delegates narrowly scoped spending to a separate runtime signer.
   Enforce allowed token, recipients and methods, per-transaction and rolling daily limits,
   expiration, replay protection and immediate revocation in contract code. Avoid arbitrary
   calldata, approvals and delegatecall. Require an explicit ownership epoch reset after
   any NFT transfer so old grants cannot revive if the NFT returns to an earlier owner.
5. The agent proposes structured payment intents. Server validation rejects unauthorized
   intents; the contract independently enforces limits. New recipients, limit increases and
   transfers back to the owner use owner signatures, never model judgment. Pause disables
   runtime execution; onchain revoke is the definitive revocation control.
6. Price inference offchain initially. Usage/run limits are not USDC caps. A prepaid ledger
   needs atomic reservations, actual usage settlement, refunds and provider-price handling
   before advertising hard inference spending budgets. No continuous onchain micropayment
   for each model token. Keep wallet funds and platform credit balances visibly distinct.
7. Test ownership changes, stale signatures, replay, concurrent spends, cap windows,
   malicious tokens, initialization, reentrancy and revocation on testnet. Obtain independent
   security review before mainnet. Jobs escrow/marketplace is outside this first wallet scope.

Approval requested: implement and test items 1–5 and 7 on LUKSO testnet, with item 6 remaining
an explicitly designed later billing phase. No mainnet deployment or real-fund movement is
included in this approval. Actual contract interfaces and verified deployment addresses must
be documented before implementation; any materially expanded contract scope returns here.
