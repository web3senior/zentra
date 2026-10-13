import { createConfig, http } from 'wagmi'
import { arbitrum, base, bsc, lukso, mainnet, monad, optimism, polygon } from 'wagmi/chains'
import { injected, safe } from 'wagmi/connectors'
import { signInChains } from '@/config/wallets'
import { lazyWalletConnect } from './lazyWalletConnect'
// Wallets for signing in, after hupsocial's setup: every browser wallet the page detects (EIP-6963,
// on by default), Safe, and WalletConnect for mobile wallets once
// NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set. The LUKSO extension is also added when it is only
// injected as window.lukso (luksoConnector.js). Connectors exist only in the browser.
const chains = [lukso, mainnet, base, monad, arbitrum, optimism, bsc, polygon]
const rpc = Object.fromEntries(signInChains.map((chain) => [chain.id, chain.rpc]))
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
const isBrowser = typeof window !== 'undefined'
export const walletConfig = createConfig({
  chains,
  connectors: isBrowser ? [injected(), safe(), ...(projectId ? [lazyWalletConnect({ projectId, showQrModal: true })] : [])] : [],
  transports: Object.fromEntries(chains.map((chain) => [chain.id, http(rpc[chain.id])])),
  ssr: true,
})
