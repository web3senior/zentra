# Buying NFTs in Zentra — approved and implemented

Approved by the owner on 2026-10-13 ("build that let users buy here directly"), as stage 2 of
`nft-market-readonly.md`. No contract code: Zentra calls Hup's deployed HupTrade from the
visitor's own wallet. Zentra holds no key, signs nothing and moves nothing itself.

## Contract (checked onchain 2026-10-13)

HupTrade on LUKSO (42): `0x4bad88a02d8a4926fE50F69A12A3e095E433CEc0`, from hupsocial's
`config/contracts.js`. `getListing(id)` and `isPurchasable(id)` matched Hup's API for listing
1370 (24 LYX, active). `buy(buyer, listingId, referral)` is payable; the price is sent as value
for LYX listings, and an ERC20/LSP7 price needs the token's approval first.

## Flow (cloned from hupsocial's NftQuickBuy)

1. Buy now: if no wallet is connected, the visitor picks one (the same list as sign-in). Signing
   in to Zentra is not required. The wallet is asked to switch to LUKSO.
2. The listing is read live. Not active or not purchasable, the visitor's own listing, or a
   different payment token: stop with a message (the last sends them to Hup to review).
3. Token prices: if the allowance is short, an Allow step (approve or authorizeOperator for the
   exact price), then the purchase.
4. A price above the one on the card never buys on that tap: the button shows the new price and
   needs a second tap.
5. buy(buyer, id, referrer) from the wallet; the card shows progress, Bought, and a link to the
   transaction on the LUKSO explorer. Listings refresh afterwards.

A rejected prompt returns to the previous step without an error. A failed transaction says
nothing was paid.

## Decisions

- **Referral:** none (`market.referrer: null` in `config/chains.js`). Sellers can offer a
  referral share; setting an address there would have Zentra receive it on sales made here.
- **Tokens:** LYX and token-priced listings both supported, as on Hup.

## Not in this stage

Listing an NFT for sale, offers, cancelling, and Hup's burner sessions (one-tap buys without a
wallet prompt). An agent buying on its own needs the agent wallet and spending limits first.
