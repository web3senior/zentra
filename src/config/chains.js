const identity = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
const reputation = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63'
// LUKSO's gateway serves any IPFS file; ipfs.io and dweb.link no longer serve files to servers
const ipfsGateway = 'https://api.universalprofile.cloud/ipfs/'
export const registries = [
  {
    id: 'lukso', name: 'LUKSO', chainId: 42, rpc: 'https://rpc.mainnet.lukso.network', source: 'explorer',
    explorerApi: 'https://explorer.execution.mainnet.lukso.network/api/v2',
    explorer: 'https://explorer.execution.mainnet.lukso.network',
    identity, reputation, ipfsGateway, scan: 'https://8004scan.io/agents/lukso/', logo: '/lukso.svg',
    refreshMinutes: 10, shown: 30,
    native: { symbol: 'LYX', decimals: 18 },
    // Hup's bounties (HupTasks 1.0.0, checked onchain 2026-10-13): read-only job board. A task's
    // brief is its Hup post, read from Hup Core; people view and reply on hup.social
    jobs: {
      tasks: '0x232AD3137Ef5c3F1E3CE04248ab9C9729d3e987a', hup: '0xf6eeC4e32a532b23ACC56b72865e79c79877CEc8',
      post: 'https://hup.social/networks/42/', refreshMinutes: 10, finished: 10,
    },
    // Hup's NFT market (HupTrade, indexed by Hup): listings from its public API, which already
    // drops listings that can no longer be bought. Buying calls HupTrade from the visitor's own
    // wallet (checked onchain 2026-10-13: getListing, isPurchasable, buy). referrer: the address
    // paid a seller's referral share on sales made here; none until the owner chooses one
    market: {
      trade: '0x4bad88a02d8a4926fE50F69A12A3e095E433CEc0', referrer: null,
      api: 'https://www.hup.social/api/v1/', site: 'https://hup.social',
      listing: 'https://hup.social/nfts/42/', collection: 'https://hup.social/nfts/42/collection/',
      refreshMinutes: 5, page: 24,
    },
  },
  {
    // About 10,400 registrations on 2026-10-13, many repeated or empty; the public RPC allows
    // log queries over roughly 100 blocks, so agents are enumerated instead
    id: 'monad', name: 'Monad', chainId: 143, rpc: 'https://rpc.monad.xyz', source: 'rpc',
    explorer: 'https://monadscan.com',
    identity, reputation, ipfsGateway, scan: 'https://8004scan.io/agents/monad/', logo: '/monad.svg',
    refreshMinutes: 360, shown: 20,
  },
  {
    // Same registries (AgentIdentity 2.0.0, checked onchain 2026-10-13), about 9,900
    // registrations: enumerated over RPC like Monad, the explorer's logs being too many to page
    id: 'celo', name: 'Celo', chainId: 42220, rpc: 'https://forno.celo.org', source: 'rpc',
    explorer: 'https://celoscan.io',
    identity, reputation, ipfsGateway, scan: 'https://8004scan.io/agents/celo/', logo: '/celo.svg',
    refreshMinutes: 360, shown: 20,
  },
]
