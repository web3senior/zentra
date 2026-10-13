'use client'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
// The browser's side of the realtime process (server/realtime.js): one WebSocket for walking
// together and live chat. It connects while the colony is visible, closes in hidden tabs, and
// reconnects with backoff. People are kept here; chat lines are passed to listeners.
function socketUrl() {
  if (process.env.NEXT_PUBLIC_REALTIME_URL)
    return process.env.NEXT_PUBLIC_REALTIME_URL
  const { protocol, hostname, host, port } = window.location
  const scheme = protocol === 'https:' ? 'wss' : 'ws'
  // Development: the realtime process listens on its own port; behind nginx it is /ws on the site
  return port === '3010' ? `${scheme}://${hostname}:3011/ws` : `${scheme}://${host}/ws`
}
export class Realtime {
  people = new Map()
  you = null
  status = 'idle'
  listeners = new Set()
  watchers = new Set()
  rooms = new Set()
  ref = 0
  pending = new Map()
  // The store snapshot for useSyncExternalStore: replaced on every change
  snapshot = { people: [], you: null, status: 'idle' }
  emit() {
    this.snapshot = { people: [...this.people.values()], you: this.you, status: this.status }
    this.watchers.forEach((watch) => watch())
  }
  subscribe = (watch) => { this.watchers.add(watch); return () => this.watchers.delete(watch); }
  getSnapshot = () => this.snapshot
  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  start() {
    this.stopped = false
    this.connect()
  }
  stop() {
    this.stopped = true
    clearTimeout(this.retry)
    this.socket?.close()
    this.socket = null
    this.people.clear()
    this.status = 'idle'
    this.emit()
  }
  connect() {
    if (this.socket || this.stopped)
      return
    const socket = new WebSocket(socketUrl())
    this.socket = socket
    this.status = 'connecting'
    this.emit()
    socket.onopen = () => {
      this.attempts = 0
      // Rooms joined before a reconnect are joined again
      this.rooms.forEach((room) => this.raw({ t: 'join', room }))
    }
    socket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      }
      catch {
        return
      }
      if (message.t === 'welcome') {
        this.you = message.you
        this.status = 'live'
        this.people = new Map(message.people.map((p) => [p.id, p]))
        this.emit()
      }
      else if (message.t === 'people') {
        this.people = new Map(message.list.map((p) => [p.id, p]))
        this.emit()
      }
      else if (message.t === 'gone') {
        this.people.delete(message.id)
        this.emit()
      }
      else if ((message.t === 'sent' || message.t === 'error') && this.pending.has(message.ref)) {
        this.pending.get(message.ref)(message)
        this.pending.delete(message.ref)
      }
      this.listeners.forEach((listener) => listener(message))
    }
    socket.onclose = () => {
      this.socket = null
      this.people.clear()
      this.status = this.stopped ? 'idle' : 'connecting'
      this.emit()
      if (!this.stopped) {
        this.attempts = (this.attempts ?? 0) + 1
        this.retry = setTimeout(() => this.connect(), Math.min(30_000, 1000 * 2 ** Math.min(this.attempts, 5)))
      }
    }
  }
  raw(message) {
    if (this.socket?.readyState === 1)
      this.socket.send(JSON.stringify(message))
  }
  // Sends and waits for the server's answer (sent or error); resolves with it
  request(message) {
    const ref = ++this.ref
    return new Promise((resolve) => {
      this.pending.set(ref, resolve)
      this.raw({ ...message, ref })
      setTimeout(() => { if (this.pending.delete(ref))
        resolve({ t: 'error', code: 'network' }); }, 10_000)
    })
  }
  join(room) { this.rooms.add(room); this.raw({ t: 'join', room }); }
  part(room) { this.rooms.delete(room); this.raw({ t: 'part', room }); }
  // After a sign-in, sign-out or new public name the connection is opened again
  restart() { this.socket?.close(); }
}
// One connection for the page while active (the colony visible); its people, you and status
export function useRealtime(active) {
  const client = useMemo(() => new Realtime(), [])
  useEffect(() => {
    if (!active)
      return
    client.start()
    return () => client.stop()
  }, [client, active])
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, () => client.snapshot)
  return { client, ...state }
}
