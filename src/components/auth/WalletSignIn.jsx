'use client'
import { useState } from 'react'
import { connect, disconnect, signMessage } from 'wagmi/actions'
import { createSiweMessage } from 'viem/siwe'
import { WalletIcon } from '@phosphor-icons/react'
import { api } from '@/components/agents/clientApi'
import { walletConfig } from '@/lib/wallet/config'
import { useWalletConnectors } from '@/lib/wallet/useWalletConnectors'
import { site } from '@/config/site'
import styles from './SignInForm.module.scss'
const copy = site.agents
// Every wallet the page knows of, as hupsocial lists them. Choosing one connects it, asks the
// server for a one-time nonce and has the wallet sign a sign-in message (EIP-4361) naming this
// site; the server checks it. The wallet is disconnected again afterwards: it only signed in.
export default function WalletSignIn({ busy, onBusy, onError, onDone }) {
  const connectors = useWalletConnectors()
  const [pending, setPending] = useState()
  async function signIn(connector) {
    onBusy(true)
    onError('')
    setPending(connector.uid)
    try {
      const connection = await connect(walletConfig, { connector })
      const address = connection.accounts[0]
      const { nonce, statement, minutes, chains } = await api('auth/wallet/nonce', 'POST', { address })
      // The wallet's own network when it is one the server can check, else Ethereum's id
      const chainId = chains.includes(connection.chainId) ? connection.chainId : 1
      const issuedAt = new Date()
      const message = createSiweMessage({ domain: window.location.host, address, statement, uri: window.location.origin, version: '1', chainId, nonce, issuedAt, expirationTime: new Date(issuedAt.getTime() + minutes * 60_000) })
      const signature = await signMessage(walletConfig, { account: address, message, connector })
      await api('auth/wallet/verify', 'POST', { message, signature })
      await onDone()
    }
    catch (error) {
      // Closing the wallet's prompt is a choice, not an error
      if (!/reject|denied|cancel/i.test(String(error?.shortMessage || error?.message)))
        onError(error)
    }
    finally {
      await disconnect(walletConfig).catch(() => { })
      setPending(undefined)
      onBusy(false)
    }
  }
  return <div className={styles.signin__wallets}>
   <p className={styles.signin__divider}><span>{copy.orWallet}</span></p>
   {connectors.length ? connectors.map((connector) => <button key={connector.uid} type="button" className={styles.signin__wallet} disabled={busy} onClick={() => signIn(connector)}>
      {connector.icon ? <img src={connector.icon} alt="" width={22} height={22}/> : <WalletIcon size={22}/>}
      <span>{connector.id === 'injected' ? copy.browserWallet : connector.name}</span>
      {pending === connector.uid && <small>{copy.walletSigning}</small>}
     </button>) : <p className={styles.signin__fine}>{copy.noWallet}</p>}
  </div>
}
