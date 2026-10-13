'use client'
import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import clsx from 'clsx'
import {
  BriefcaseIcon,
  StorefrontIcon,
  ArrowSquareOutIcon,
  ChatCircleDotsIcon,
  ChatTextIcon,
  ProhibitIcon,
  MusicNotesIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  LeafIcon,
  FootprintsIcon,
  CompassIcon,
  PlusIcon,
  ArrowsClockwiseIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from '@phosphor-icons/react'
import { ContentSpinner } from '@/components/Loading'
import Avatar from '@/components/ui/Avatar'
import { openSignIn } from '@/lib/signIn'
import { SampleForm } from './SampleForm'
import { ChainPanel } from './ChainPanel'
import { NetworkModal } from './NetworkModal'
import ChatPanel from './ChatPanel'
import { api } from '@/components/agents/clientApi'
import { useRealtime } from '@/lib/realtime'
import { dmRoom } from '@/lib/chatRooms'
import { JobBoardPanel } from './JobBoardPanel'
import MarketGrid from '@/components/market/MarketGrid'
import { sampleAgents } from './samples'
import { site } from '@/config/site'
import styles from './Garden.module.scss'
const copy = site.garden
const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => (
    <div className={styles.garden__loading}>
      <ContentSpinner label={copy.loading} color={undefined} className={undefined} />
    </div>
  ),
})
class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error(error)
  }
  render() {
    return this.state.failed ? (
      <div className={styles.garden__loading}>
        <p>{copy.unavailable}</p>
      </div>
    ) : (
      this.props.children
    )
  }
}
const none = []
const MARKET = 'market'
// live: real agents, read-only here; panel renders the selected agent's chat. districts: chain
// registries' agents, shown read-only in every mode. boards: chains' job boards, read-only too.
// market: Hup's NFT market ({ count, more }), its stall opening the listings in a panel
export default function Garden({
  agents: supplied,
  onAgentsChange,
  onSelectAgent,
  live = false,
  notice,
  panel,
  visitor = copy.you,
  visitorUp = false,
  districts = none,
  boards = none,
  market,
  readOnly = false,
  signedIn = false,
  sessionKey = '',
}) {
  const [local, setLocal] = useState(() => sampleAgents.slice(0, 6))
  const agents = supplied ?? local
  const [selected, setSelected] = useState()
  const [mode, setMode] = useState('map')
  const [reset, setReset] = useState(0)
  const [network, setNetwork] = useState()
  const [boardId, setBoardId] = useState()
  const board = boards.find((b) => b.id === boardId)
  // The market shares the boards' panel slot, so everything that closes a board closes it too
  const marketOpen = boardId === MARKET
  const [playing, setPlaying] = useState()
  const [mutedPlots, setMutedPlots] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('colony-muted-plots') || '[]')
      return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(false)
  const [ready, setReady] = useState(false)
  const [creating, setCreating] = useState(false)
  const stage = useRef(null)
  const input = useRef({ keys: new Set() })
  const close = useRef(null)
  const agent = agents.find((a) => a.id === selected)
  const chain = districts
    .flatMap((district) => district.agents.map((resident, i) => ({ district, resident, record: district.records[i] })))
    .find((hit) => hit.resident.id === selected)
  const shown = agent ?? chain?.resident
  const changed = (next) => {
    if (!supplied) setLocal(next)
    onAgentsChange?.(next)
  }
  const select = useCallback((id) => {
    setBoardId(undefined)
    setSelected(id)
  }, [])
  const openBoard = useCallback((id) => {
    setSelected(undefined)
    setBoardId(id)
  }, [])
  const openMarket = useCallback(() => {
    setSelected(undefined)
    setBoardId(MARKET)
  }, [])
  const openDistrict = useCallback((id) => {
    setSelected(undefined)
    setNetwork(id)
  }, [])
  const onReady = useCallback(() => setReady(true), [])
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    let inView = true
    const sync = () => {
      setVisible(inView && !document.hidden)
      setReduced(query.matches)
    }
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      sync()
    })
    if (stage.current) observer.observe(stage.current)
    query.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      observer.disconnect()
      query.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  useEffect(() => {
    if (board || marketOpen) close.current?.focus({ preventScroll: true })
  }, [board, marketOpen])
  useEffect(() => {
    if (shown) {
      close.current?.focus({ preventScroll: true })
      onSelectAgent?.(shown)
    }
  }, [shown, onSelectAgent])
  // Mute is a per-viewer convenience; storage may be unavailable
  // Muting is per plot (touch its boombox, or the chip): a per-viewer convenience kept in storage when available
  const toggleMute = useCallback(
    (id) =>
      setMutedPlots((current) => {
        const next = current.includes(id) ? current.filter((m) => m !== id) : [...current, id]
        try {
          localStorage.setItem('colony-muted-plots', JSON.stringify(next))
        } catch {}
        return next
      }),
    []
  )
  const muted = !!playing && mutedPlots.includes(playing)
  const onPlaying = useCallback((id) => setPlaying(id), [])
  const playingAgent = agents.find((a) => a.id === playing)
  useEffect(() => {
    const escape = (event) => {
      if (event.key === 'Escape') {
        setSelected(undefined)
        setBoardId(undefined)
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])
  const create = (name, type) => {
    const next = { id: crypto.randomUUID(), name, type, status: 'idle', currentTask: copy.noTask, model: 'GPT' }
    changed([...agents, next])
    setCreating(false)
    setSelected(next.id)
  }
  const animate = visible && !reduced && !paused
  // People together (server/realtime.js): connected while the colony is on screen; opened again
  // when the person signs in or out or picks their public name
  const realtime = useRealtime(visible)
  const realtimeClient = realtime.client
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    realtimeClient.restart()
  }, [sessionKey, realtimeClient])
  const [area, setArea] = useState('hub')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatRoom, setChatRoom] = useState(null)
  const [personId, setPersonId] = useState()
  const person = realtime.people.find((p) => p.id === personId)
  // A Universal Profile's public profile (picture, name, bio, links), read from LUKSO at sign-in
  const upProfile = useQuery({
    queryKey: ['person', personId],
    queryFn: ({ signal }) => api(`people/${personId}`, 'GET', undefined, signal),
    enabled: !!person?.up,
    staleTime: 60_000,
    select: (data) => data.profile,
  }).data
  const unread = useQuery({
    queryKey: ['chat-dm'],
    queryFn: ({ signal }) => api('chat/dm', 'GET', undefined, signal),
    enabled: !!realtime.you,
    refetchInterval: 60_000,
    select: (data) => data.conversations.reduce((sum, c) => sum + c.unread, 0),
  })
  // A new 1:1 line refreshes the unread count
  const queryClient = useQueryClient()
  useEffect(
    () =>
      realtimeClient.on((message) => {
        if (message.t === 'line' && message.line.room.startsWith('dm:')) queryClient.invalidateQueries({ queryKey: ['chat-dm'] })
      }),
    [realtimeClient, queryClient]
  )
  const selectPerson = useCallback((id) => {
    setSelected(undefined)
    setBoardId(undefined)
    setPersonId(id)
  }, [])
  const message = (id) => {
    setPersonId(undefined)
    setChatRoom(dmRoom(realtime.you.id, id))
    setChatOpen(true)
  }
  const names = Object.fromEntries(realtime.people.map((p) => [p.id, p.name]))
  return (
    <main
      className={styles.garden}
      data-ready={ready}
      data-mode={mode}
      data-agents={agents.length}
      data-animation={animate ? 'running' : 'paused'}
    >
      <div ref={stage} className={styles.garden__stage}>
        <Boundary>
          <Scene
            agents={agents}
            districts={districts}
            onOpenDistrict={openDistrict}
            boards={boards}
            onOpenBoard={openBoard}
            market={market}
            onOpenMarket={openMarket}
            mutedPlots={mutedPlots}
            onToggleMute={toggleMute}
            playing={playing}
            onPlaying={onPlaying}
            visitor={visitor}
            visitorUp={visitorUp}
            selected={selected}
            mode={mode}
            reset={reset}
            inputRef={input}
            people={realtime.people}
            realtime={realtimeClient}
            shareWalk={!!realtime.you?.named}
            onSelectPerson={selectPerson}
            onArea={setArea}
            visible={visible}
            animate={animate}
            blocked={!!shown || !!board || marketOpen || creating || !!network}
            onSelect={select}
            onReady={onReady}
          />
        </Boundary>
      </div>
      {readOnly ? (
        mode === 'map' && (
          <header className={clsx(styles.garden__intro, styles['garden__intro--hero'])}>
            <p>
              <LeafIcon size={15} />
              {copy.hero.eyebrow}
            </p>
            <h1>{copy.hero.heading}</h1>
            <span>{copy.hero.description}</span>
            <ul className={styles.garden__heroStats} aria-label={copy.hero.statsLabel}>
              <li>
                <b>{new Intl.NumberFormat('en').format(districts.length)}</b>
                {copy.hero.chains}
              </li>
              <li>
                <b>{new Intl.NumberFormat('en').format(districts.reduce((sum, d) => sum + d.agents.length, 0))}</b>
                {copy.hero.agents}
              </li>
              <li>
                <b>{new Intl.NumberFormat('en').format(boards.reduce((sum, b) => sum + b.open, 0))}</b>
                {copy.hero.jobs}
              </li>
            </ul>
            <div className={styles.garden__heroActions}>
              <button
                className={styles.garden__heroPrimary}
                onClick={() => {
                  input.current.keys.clear()
                  setSelected(undefined)
                  setBoardId(undefined)
                  setMode('walk')
                }}
              >
                <FootprintsIcon size={18} />
                {copy.walk}
              </button>
              {!signedIn && <button onClick={openSignIn}>{copy.hero.signIn}</button>}
            </div>
            {(boards.length > 0 || districts.length > 0 || market) && (
              <nav className={styles.garden__places} aria-label={copy.hero.places}>
                <span>{copy.hero.places}</span>
                {boards.map((b) => (
                  <button
                    key={`jobs:${b.id}`}
                    aria-label={`${copy.jobs.open}: ${b.name}`}
                    aria-pressed={boardId === b.id}
                    onClick={() => openBoard(b.id)}
                  >
                    <BriefcaseIcon size={14} />
                    {copy.jobs.title}
                  </button>
                ))}
                {market && (
                  <button aria-label={site.market.open} aria-pressed={marketOpen} onClick={openMarket}>
                    <StorefrontIcon size={14} />
                    {site.market.title}
                  </button>
                )}
                {districts.map((d) => (
                  <button key={`network:${d.id}`} aria-label={`${copy.network.open}: ${d.name}`} onClick={() => openDistrict(d.id)}>
                    <span data-tone={d.id} />
                    {d.name}
                  </button>
                ))}
              </nav>
            )}
          </header>
        )
      ) : (
        <>
          <header className={styles.garden__intro}>
            <p>
              <LeafIcon size={15} />
              {copy.eyebrow}
            </p>
            <h1>{copy.heading}</h1>
            <span>{copy.description}</span>
          </header>
          <div className={styles.garden__badge}>
            <i />
            <span>{live ? copy.live : copy.sample}</span>
            <b>
              {new Intl.NumberFormat('en').format(agents.length)} {copy.residents}
            </b>
          </div>
        </>
      )}
      <div className={styles.garden__topActions}>
        <button aria-label={paused ? copy.resume : copy.pause} onClick={() => setPaused(!paused)}>
          {paused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}
        </button>
        {readOnly && (
          <button
            className={styles.garden__chatButton}
            aria-expanded={chatOpen}
            onClick={() => {
              setChatRoom(null)
              setChatOpen(!chatOpen)
            }}
          >
            <ChatCircleDotsIcon size={18} />
            {site.chat.open}
            {unread.data > 0 && <em aria-label={`${unread.data} ${site.chat.unread}`}>{unread.data}</em>}
          </button>
        )}
        {!live && !readOnly && (
          <button className={styles.garden__add} onClick={() => setCreating(true)}>
            <PlusIcon size={16} />
            {copy.add}
          </button>
        )}
      </div>
      {notice && (
        <p className={styles.garden__notice}>
          {notice.text} <Link href={notice.href}>{notice.label}</Link>
        </p>
      )}
      {agent && live && (
        <aside className={clsx(styles.garden__panel, styles['garden__panel--chat'])} aria-label={`${agent.name} ${copy.details}`}>
          <header>
            <div className={styles.garden__who}>
              <div className={styles.garden__portrait}>{agent.name.slice(0, 1)}</div>
              <div>
                <h2>{agent.name}</h2>
                <p>{agent.currentTask}</p>
              </div>
            </div>
            <button ref={close} aria-label={copy.close} onClick={() => setSelected(undefined)}>
              <XIcon size={18} />
            </button>
          </header>
          {panel?.(agent)}
        </aside>
      )}
      {agent && !live && (
        <aside className={styles.garden__panel} aria-label={`${agent.name} ${copy.details}`}>
          <header>
            <span>{copy.details}</span>
            <button ref={close} aria-label={copy.close} onClick={() => setSelected(undefined)}>
              <XIcon size={18} />
            </button>
          </header>
          <div className={styles.garden__portrait}>{agent.name.slice(0, 1)}</div>
          <h2>{agent.name}</h2>
          <p>{copy.types[agent.type]}</p>
          <dl>
            <div>
              <dt>{copy.task}</dt>
              <dd>{agent.currentTask || copy.noTask}</dd>
            </div>
            <div>
              <dt>{copy.model}</dt>
              <dd>{agent.model}</dd>
            </div>
          </dl>
          {!readOnly && (
            <>
              <label>
                {copy.status}
                <select
                  aria-label={copy.status}
                  value={agent.status}
                  onChange={(event) => changed(agents.map((a) => (a.id === agent.id ? { ...a, status: event.target.value } : a)))}
                >
                  {Object.entries(copy.statuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={styles.garden__remove}
                onClick={() => {
                  changed(agents.filter((a) => a.id !== agent.id))
                  setSelected(undefined)
                }}
              >
                {copy.remove}
              </button>
            </>
          )}
        </aside>
      )}
      {chain && (
        <aside className={clsx(styles.garden__panel, styles['garden__panel--chat'])} aria-label={`${chain.resident.name} ${copy.details}`}>
          <header>
            <div className={styles.garden__who}>
              <div className={styles.garden__portrait}>{chain.resident.name.slice(0, 1)}</div>
              <div>
                <h2>{chain.resident.name}</h2>
                <p>
                  {chain.district.name} {copy.chain.agent}
                </p>
              </div>
            </div>
            <button ref={close} aria-label={copy.close} onClick={() => setSelected(undefined)}>
              <XIcon size={18} />
            </button>
          </header>
          <ChainPanel district={chain.district} record={chain.record} />
        </aside>
      )}
      {board && (
        <aside className={clsx(styles.garden__panel, styles['garden__panel--chat'])} aria-label={`${copy.jobs.title}: ${board.name}`}>
          <header>
            <div className={styles.garden__who}>
              <div className={clsx(styles.garden__portrait, styles['garden__portrait--jobs'])}>
                <BriefcaseIcon size={20} />
              </div>
              <div>
                <h2>{copy.jobs.title}</h2>
                <p>
                  {copy.jobs.eyebrow} · {board.name}
                </p>
              </div>
            </div>
            <button ref={close} aria-label={copy.jobs.close} onClick={() => setBoardId(undefined)}>
              <XIcon size={18} />
            </button>
          </header>
          <JobBoardPanel board={board} />
        </aside>
      )}
      {marketOpen && (
        <aside className={clsx(styles.garden__panel, styles['garden__panel--chat'])} aria-label={site.market.title}>
          <header>
            <div className={styles.garden__who}>
              <div className={clsx(styles.garden__portrait, styles['garden__portrait--market'])}>
                <StorefrontIcon size={20} />
              </div>
              <div>
                <h2>{site.market.title}</h2>
                <p>{site.market.eyebrow}</p>
              </div>
            </div>
            <button ref={close} aria-label={site.market.close} onClick={() => setBoardId(undefined)}>
              <XIcon size={18} />
            </button>
          </header>
          <div className={styles.garden__market}>
            <Link href={site.market.path} className={styles.garden__marketLink}>
              <ArrowSquareOutIcon size={14} />
              {site.market.openPage}
            </Link>
            <MarketGrid compact />
          </div>
        </aside>
      )}
      {person && (
        <aside className={styles.garden__panel} aria-label={`${site.chat.person}: ${person.name}`}>
          <header>
            <span>{site.chat.person}</span>
            <button aria-label={copy.close} onClick={() => setPersonId(undefined)}>
              <XIcon size={18} />
            </button>
          </header>
          {upProfile?.background && (
            <img className={styles.garden__cover} src={upProfile.background} alt="" decoding="async" />
          )}
          <Avatar src={upProfile?.avatar} name={person.name} size={52} className={styles.garden__portrait} />
          <h2>{upProfile?.name || person.name}</h2>
          <p>
            {upProfile?.name && upProfile.name !== person.name ? `@${person.name} · ` : ''}
            {person.up ? `${site.upMark.alt} · ` : ''}
            {site.chat.walking}
          </p>
          {upProfile?.description && <p className={styles.garden__bio}>{upProfile.description}</p>}
          {upProfile && (
            <ul className={styles.garden__links}>
              {upProfile.links.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer nofollow">
                    {link.title}
                  </a>
                </li>
              ))}
              <li>
                <a href={upProfile.url} target="_blank" rel="noopener noreferrer">
                  {site.chat.upProfile}
                </a>
              </li>
            </ul>
          )}
          <div className={styles.garden__personActions}>
            {realtime.you?.named ? (
              <button className={styles.garden__heroPrimary} onClick={() => message(person.id)}>
                <ChatTextIcon size={16} />
                {site.chat.message}
              </button>
            ) : (
              <button onClick={openSignIn}>{site.chat.signIn}</button>
            )}
            {realtime.you && (
              <button
                onClick={async () => {
                  await api('chat/block', 'POST', { user: person.id, blocked: true }).catch(() => {})
                  realtimeClient.raw({ t: 'blocks' })
                  setPersonId(undefined)
                }}
              >
                <ProhibitIcon size={16} />
                {site.chat.block}
              </button>
            )}
          </div>
        </aside>
      )}
      {chatOpen && (
        <ChatPanel
          key={chatRoom ?? 'here'}
          realtime={realtimeClient}
          you={realtime.you}
          status={realtime.status}
          area={area}
          room={chatRoom}
          people={realtime.people.length + (realtime.you?.named ? 1 : 0)}
          names={names}
          onClose={() => setChatOpen(false)}
        />
      )}
      {mode === 'walk' && playingAgent && (
        <div className={styles.garden__playing} role="status">
          <MusicNotesIcon size={16} />
          <span>
            {copy.music.playing} <b>{playingAgent.name}</b>
          </span>
          <button
            aria-label={muted ? copy.music.unmute : copy.music.mute}
            aria-pressed={muted}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => playing && toggleMute(playing)}
          >
            {muted ? <SpeakerSlashIcon size={16} /> : <SpeakerHighIcon size={16} />}
          </button>
        </div>
      )}
      <footer className={styles.garden__footer}>
        <div className={styles.garden__instructions}>
          {/* The walking pad sits at the bottom, where the controls are; the overview needs none */}
          {mode === 'walk' && !shown && !creating && (
            <div className={styles.garden__pad} role="group" aria-label={copy.movement}>
              {[
                ['KeyW', '↑'],
                ['KeyA', '←'],
                ['KeyS', '↓'],
                ['KeyD', '→'],
              ].map(([key, symbol]) => (
                <button
                  key={key}
                  aria-label={copy.directions[key]}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    input.current.keys.add(key)
                    input.current.invalidate?.()
                  }}
                  onPointerUp={() => input.current.keys.delete(key)}
                  onPointerCancel={() => input.current.keys.delete(key)}
                  onLostPointerCapture={() => input.current.keys.delete(key)}
                >
                  {symbol}
                </button>
              ))}
              <button
                className={styles.garden__run}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  input.current.keys.add('ShiftLeft')
                }}
                onPointerUp={() => input.current.keys.delete('ShiftLeft')}
                onPointerCancel={() => input.current.keys.delete('ShiftLeft')}
                onLostPointerCapture={() => input.current.keys.delete('ShiftLeft')}
              >
                {copy.run}
              </button>
              <button
                className={styles.garden__jump}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  input.current.keys.add('Space')
                  input.current.jump = true
                  input.current.invalidate?.()
                }}
                onPointerUp={() => input.current.keys.delete('Space')}
                onPointerCancel={() => input.current.keys.delete('Space')}
                onLostPointerCapture={() => input.current.keys.delete('Space')}
              >
                {copy.jump}
              </button>
            </div>
          )}
          {!readOnly && <small>{live ? copy.liveNote : copy.note}</small>}
        </div>
        <div className={styles.garden__controls}>
          {['map', 'walk'].map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                input.current.keys.clear()
                setSelected(undefined)
                setBoardId(undefined)
                setMode(value)
              }}
            >
              {value === 'map' ? <CompassIcon size={18} /> : <FootprintsIcon size={18} />}
              {copy[value]}
            </button>
          ))}
          <button
            aria-label={copy.reset}
            onClick={() => {
              setSelected(undefined)
              setReset((value) => value + 1)
            }}
          >
            <ArrowsClockwiseIcon size={18} />
          </button>
        </div>
      </footer>
      {network && districts.find((d) => d.id === network) && (
        <NetworkModal
          district={districts.find((d) => d.id === network)}
          onClose={() => setNetwork(undefined)}
          onSelectAgent={(id) => {
            setNetwork(undefined)
            select(id)
          }}
        />
      )}
      {creating && <SampleForm onClose={() => setCreating(false)} onCreate={create} />}
    </main>
  )
}
