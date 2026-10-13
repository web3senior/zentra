import { useEffect, useState } from 'react'
import { Color } from 'three'
const tones = ['teal', 'rust', 'violet', 'blue', 'pink', 'gold']
// Chain districts use their brand colour; ids match config/chains.js
const chainTones = ['lukso', 'monad', 'base', 'celo']
export const isChainTone = (id) => chainTones.includes(id)
export const plotTones = tones
const names = ['sky', 'grass', 'edge', 'path', 'water', 'ripple', 'leaf', 'leaf-light', 'pink', 'pink-light', 'bark', 'stone', 'wood', 'lamp', 'cream', 'ink', 'blue', 'lavender', 'gold',
  'regolith', 'regolith-dark', 'rock', 'space', 'haze', 'sun', 'moonrock', 'visor', 'hull', 'hull-shade', 'robot', 'robot-shade', 'robot-joint', 'robot-screen', 'up-suit', 'up-shade', 'dome', 'glass', 'vacant', 'vacant-edge', 'bubble', 'earth',
  ...[...tones, ...chainTones].map((t) => `plot-${t}`), ...[...tones, ...chainTones].map((t) => `edge-${t}`)]
const read = () => { const style = getComputedStyle(document.documentElement); return Object.fromEntries(names.map((name) => [name, new Color(style.getPropertyValue(`--color-garden-${name}`).trim())])); }
export function useGardenPalette() {
  const [palette, setPalette] = useState(read)
  useEffect(() => { const observer = new MutationObserver(() => setPalette((current) => { const next = read(); return names.every((name) => next[name].equals(current[name])) ? current : next; })); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] }); return () => observer.disconnect(); }, [])
  return palette
}
