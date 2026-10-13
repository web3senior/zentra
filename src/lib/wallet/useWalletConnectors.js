'use client'
import { useConnectors } from 'wagmi'
// Every wallet the page knows of, as hupsocial lists them: Safe only inside the Safe app, and the
// generic injected entry only when a wallet is injected without announcing itself (announced
// wallets list under their own name)
export function useWalletConnectors() {
  const all = useConnectors()
  const announced = all.some((c) => c.type === 'injected' && c.id !== 'injected')
  return all.filter((c) => (c.id !== 'safe' || window.self !== window.top) && (c.id !== 'injected' || (!!window.ethereum && !announced)))
}
