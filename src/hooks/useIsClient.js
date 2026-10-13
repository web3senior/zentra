'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** False during SSR and hydration, true after; for UI that only exists in the browser. */
export default function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
