# Colony NFT market, read-only — approved and implemented

Approved by the owner on 2026-10-13 ("add marketplace section too"): Hup's NFT market shown in
Zentra, read-only, LUKSO only. Implemented the same day. No contract code, no wallet connection,
no transactions and no money movement. Buying in Zentra is stage 2, which waits for the wallet
milestone and its own approved plan.

## Source

Hup's HupTrade listings, indexed by Hup. Two public endpoints (checked 2026-10-13):

- `GET https://www.hup.social/api/v1/nfts?networkId=42&status=active|sold&sort=…&page=…&limit=…`:
  listing id, collection, token id, price with token symbol and decimals, seller with name and
  picture, listed time; sold rows carry the last sale. Hup already drops listings that can no
  longer be bought (`backed`).
- `POST https://www.hup.social/api/v1/nfts/metadata` with up to 60 tokens: name, collection name,
  description and image (`ipfs://`, https, or Hup's `/api/nft/image` proxy for onchain art).

Reading HupTrade ourselves was rejected for now: it would mean rebuilding Hup's indexer, its
"still buyable" sweep and its metadata cache. The trade-off is depending on hup.social being up.

## What visitors see

- **The colony:** a Market stall on the home colony's plot before the job boards, with a sign
  showing how many NFTs are for sale (`24+` when there are more pages). Selecting it, or Market in
  the hero's places, opens a panel with the listings and a link to the full market.
- **`/market`:** the full grid, linked from the header. Tabs for sale and recently sold, sorting
  by newest or price, and Load more.
- Each card: image, name, collection (linking to Hup's collection page), price, seller with
  picture, and Buy on Hup (View on Hup when sold), which opens the listing on hup.social.

## How it works

- Config: `market` on the LUKSO entry of `config/chains.js`; copy in `site.market`.
- `lib/zentra/market.js` fetches a page of listings and one metadata batch for it (15 s timeout,
  1 MB cap), keeps each page in memory for `refreshMinutes` (5) and serves a stale page while it
  refreshes. Text is capped plain text, images https only, IPFS through LUKSO's gateway.
- `GET /api/zentra/market?status&sort&page` is public and cached for a minute.
- `components/market/MarketGrid.jsx` is shared by the page and the colony panel.

## Not in this stage

Buying, listing, offers and showing a seller's listings on their own plot. Buying needs the
visitor's wallet to call HupTrade, which needs the wallet plan approved first.
