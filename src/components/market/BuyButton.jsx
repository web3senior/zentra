'use client'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi, formatUnits, parseAbi, zeroAddress } from 'viem'
import { connect, getConnection, readContract, switchChain, waitForTransactionReceipt, writeContract } from 'wagmi/actions'
import { ArrowSquareOutIcon, CheckCircleIcon, ShoppingCartIcon, WalletIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { Spinner } from '@/components/Loading'
import { registries } from '@/config/chains'
import { site } from '@/config/site'
import { walletConfig } from '@/lib/wallet/config'
import { useWalletConnectors } from '@/lib/wallet/useWalletConnectors'
import styles from './MarketGrid.module.scss'
const copy = site.market.buying
const registry = registries.find((r) => r.market)
// HupTrade (copied from hupsocial's abis/HupTrade.json) and LSP7's operator allowance
const tradeAbi = parseAbi([
  'function getListing(uint256 _listingId) view returns ((address seller, address collection, bytes32 tokenId, bool isLsp8, address token, bool isTokenLsp7, uint256 price, uint256 referralBps, uint256 listedAt, uint8 status))',
  'function isPurchasable(uint256 _listingId) view returns (bool)',
  'function buy(address _buyer, uint256 _listingId, address _referral) payable',
])
const lsp7Abi = parseAbi([
  'function authorizedAmountFor(address operator, address tokenOwner) view returns (uint256)',
  'function authorizeOperator(address operator, uint256 amount, bytes operatorNotificationData)',
])
const ACTIVE = 1
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 4 })
const rejected = (error) => /reject|denied|cancel/i.test(String(error?.shortMessage || error?.message))
// Buys one listing from the visitor's own wallet, after hupsocial's NftQuickBuy: nothing is read
// onchain until the tap, then the listing is checked live (still for sale, not their own, same
// payment token, allowance) before anything moves. A price that went up never buys on the tap that
// saw the lower one: it asks for a second tap on the new price. Every transaction is the wallet's
// own prompt; Zentra holds no key and sends nothing itself.
export default function BuyButton({ item, explorer }) {
  const queryClient = useQueryClient()
  const connectors = useWalletConnectors()
  // idle → connect → checking → approve | confirm → wallet → waiting → done; gone is terminal
  const [phase, setPhase] = useState('idle')
  const [note, setNote] = useState('')
  const [hash, setHash] = useState()
  const live = useRef(null)
  // The live price a confirm tap is asked for, when it went up
  const [raised, setRaised] = useState(0n)
  const { chainId, market } = registry
  const trade = market.trade
  const id = BigInt(item.id)
  const priced = (amount) => item.token ? `${number.format(Number(formatUnits(amount, item.token.decimals)))} ${item.token.symbol}` : ''
  // A step that needs the visitor: stop at phase with a note
  const halt = (next, text = '') => {
    setPhase(next)
    setNote(text)
  }
  const fail = (error, back) => {
    setPhase(back)
    setNote(rejected(error) ? '' : copy.failed)
  }
  async function account() {
    const connection = getConnection(walletConfig)
    if (connection.chainId !== chainId)
      await switchChain(walletConfig, { chainId })
    return connection.address
  }
  async function pay(buyer, listing) {
    setPhase('wallet')
    setNote('')
    const sent = await writeContract(walletConfig, {
      chainId, address: trade, abi: tradeAbi, functionName: 'buy', args: [buyer, id, market.referrer ?? zeroAddress],
      ...(listing.token === zeroAddress ? { value: listing.price } : {}),
    })
    setHash(sent)
    setPhase('waiting')
    const receipt = await waitForTransactionReceipt(walletConfig, { chainId, hash: sent })
    if (receipt.status !== 'success')
      throw new Error('reverted')
    setPhase('done')
    queryClient.invalidateQueries({ queryKey: ['market'] })
    queryClient.invalidateQueries({ queryKey: ['garden-market'] })
  }
  async function check() {
    setPhase('checking')
    setNote('')
    try {
      const buyer = await account()
      const [listing, purchasable] = await Promise.all([
        readContract(walletConfig, { chainId, address: trade, abi: tradeAbi, functionName: 'getListing', args: [id] }),
        readContract(walletConfig, { chainId, address: trade, abi: tradeAbi, functionName: 'isPurchasable', args: [id] }),
      ])
      if (Number(listing.status) !== ACTIVE || !purchasable)
        return halt('gone', copy.unavailable)
      if (listing.seller.toLowerCase() === buyer.toLowerCase())
        return halt('gone', copy.own)
      // Another payment token cannot be priced against what the card shows
      if (listing.token.toLowerCase() !== item.paymentToken)
        return halt('gone', copy.changed)
      live.current = { buyer, listing }
      if (listing.token !== zeroAddress) {
        const allowance = listing.isTokenLsp7
          ? await readContract(walletConfig, { chainId, address: listing.token, abi: lsp7Abi, functionName: 'authorizedAmountFor', args: [trade, buyer] })
          : await readContract(walletConfig, { chainId, address: listing.token, abi: erc20Abi, functionName: 'allowance', args: [buyer, trade] })
        if (allowance < listing.price)
          return halt('approve')
      }
      if (listing.price > BigInt(item.price)) {
        setRaised(listing.price)
        return halt('confirm', copy.priceUp)
      }
      await pay(buyer, listing)
    }
    catch (error) {
      fail(error, 'idle')
    }
  }
  async function approve() {
    const { buyer, listing } = live.current
    setPhase('wallet')
    setNote('')
    try {
      const sent = listing.isTokenLsp7
        ? await writeContract(walletConfig, { chainId, address: listing.token, abi: lsp7Abi, functionName: 'authorizeOperator', args: [trade, listing.price, '0x'] })
        : await writeContract(walletConfig, { chainId, address: listing.token, abi: erc20Abi, functionName: 'approve', args: [trade, listing.price] })
      setPhase('waiting')
      await waitForTransactionReceipt(walletConfig, { chainId, hash: sent })
      if (listing.price > BigInt(item.price)) {
        setRaised(listing.price)
        return halt('confirm', copy.priceUp)
      }
      await pay(buyer, listing)
    }
    catch (error) {
      fail(error, 'approve')
    }
  }
  async function confirm() {
    try {
      await pay(live.current.buyer, live.current.listing)
    }
    catch (error) {
      fail(error, 'confirm')
    }
  }
  async function choose(connector) {
    setPhase('checking')
    try {
      await connect(walletConfig, { connector, chainId })
      await check()
    }
    catch (error) {
      fail(error, 'connect')
    }
  }
  function start() {
    if (getConnection(walletConfig).address)
      check()
    else {
      setNote('')
      setPhase('connect')
    }
  }
  if (item.status !== 'active' || !item.price)
    return null
  const busy = ['checking', 'wallet', 'waiting'].includes(phase)
  const label = phase === 'checking' ? copy.checking : phase === 'wallet' ? copy.wallet : phase === 'waiting' ? copy.waiting
    : phase === 'approve' ? copy.approve(item.token?.symbol ?? '') : phase === 'confirm' ? copy.confirm(priced(raised))
      : phase === 'done' ? copy.done : phase === 'gone' ? copy.gone : copy.buy
  const action = phase === 'approve' ? approve : phase === 'confirm' ? confirm : start
  return <div className={styles.market__buying}>
  {phase === 'connect' ? <div className={styles.market__wallets}>
    <p>{copy.connect}</p>
    {connectors.length ? connectors.map((connector) => <button key={connector.uid} type="button" onClick={() => choose(connector)}>
      {connector.icon ? <img src={connector.icon} alt="" width={18} height={18}/> : <WalletIcon size={18}/>}
      <span>{connector.id === 'injected' ? site.agents.browserWallet : connector.name}</span>
     </button>) : <p>{site.agents.noWallet}</p>}
    <button type="button" className={styles.market__cancel} onClick={() => setPhase('idle')}>{copy.cancel}</button>
   </div>
      : <button type="button" className={clsx(styles.market__buy, phase === 'done' && styles['market__buy--done'], phase === 'gone' && styles['market__buy--quiet'])} disabled={busy || phase === 'done' || phase === 'gone'} onClick={action}>
    {busy ? <Spinner size={14} color="currentColor" label={label}/> : phase === 'done' ? <CheckCircleIcon size={14}/> : <ShoppingCartIcon size={14}/>}
    {label}
   </button>}
  {note && <p role="status" className={styles.market__notice}>{note}</p>}
  {hash && <a target="_blank" rel="noopener noreferrer" href={`${explorer}/tx/${hash}`} className={styles.market__tx}><ArrowSquareOutIcon size={12}/>{copy.tx}</a>}
 </div>
}
