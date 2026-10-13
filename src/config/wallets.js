// Wallet sign-in (docs/plans/people-presence-chat.md): the chains a sign-in message may name, with
// the RPC the server uses to check smart-account signatures (ERC-1271, Universal Profiles) on that
// chain. Ordinary wallets verify without one. Universal Profiles are recognised on LUKSO.
export const signInChains = [
  { id: 42, name: 'LUKSO', rpc: 'https://rpc.mainnet.lukso.network' },
  { id: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
  { id: 8453, name: 'Base', rpc: 'https://base-rpc.publicnode.com' },
  { id: 143, name: 'Monad', rpc: 'https://rpc.monad.xyz' },
  { id: 42161, name: 'Arbitrum', rpc: 'https://arbitrum-one-rpc.publicnode.com' },
  { id: 10, name: 'Optimism', rpc: 'https://optimism-rpc.publicnode.com' },
  { id: 56, name: 'BNB Chain', rpc: 'https://bsc-rpc.publicnode.com' },
  { id: 137, name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com' },
]
// LSP3Profile is keccak256('LSP3Profile'); its document and images load through LUKSO's IPFS gateway
export const universalProfile = { chainId: 42, interfaceId: '0x24871b3d', lsp3Key: '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5', ipfsGateway: 'https://api.universalprofile.cloud/ipfs/', profileUrl: 'https://universaleverything.io/' }
// The sign-in message's statement and lifetime
export const signInMessage = { statement: 'Sign in to Zentra. This signature only signs you in; it approves no transaction.', minutes: 10 }
