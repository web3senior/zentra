import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AudioListener, PositionalAudio, Vector3 } from 'three'
import { HEX, PLOT_REACH, hexCenter } from './layout'
// While walking, a plot's track plays on a loop only while the visitor stands on that plot, and
// stops on stepping off. One track at a time, panned from the plot. The listener rides on the
// camera, which follows the astronaut.
// mutedIds: plots the visitor muted by touching their boombox; they stay silent while on them
export function PlotMusic({ sources, active, mutedIds, onPlaying }) {
  const { camera, scene } = useThree()
  const state = useRef({ checked: 0 })
  const at = useMemo(() => new Vector3(), [])
  const stop = useCallback(() => {
    const s = state.current
    if (s.element) {
      s.element.pause()
      s.element.removeAttribute('src')
      s.element.load()
    }
    if (s.sound) {
      s.sound.disconnect()
      scene.remove(s.sound)
    }
    s.sound = undefined
    s.element = undefined
    if (s.id) {
      s.id = undefined
      onPlaying(undefined)
    }
  }, [scene, onPlaying])
  useEffect(() => {
    if (!active)
      return
    const s = state.current
    const listener = new AudioListener()
    camera.add(listener)
    s.listener = listener
    return () => { stop(); camera.remove(listener); s.listener = undefined; }
  }, [active, camera, stop])
  useEffect(() => { const s = state.current; s.listener?.setMasterVolume(s.id && mutedIds.includes(s.id) ? 0 : 1); }, [mutedIds, active])
  useEffect(() => { if (state.current.id && !sources.some((s) => s.id === state.current.id))
    stop(); }, [sources, stop])
  useFrame(({ clock }) => {
    const s = state.current
    if (!active || !s.listener || clock.elapsedTime - s.checked < .3)
      return
    s.checked = clock.elapsedTime
    const visitor = scene.getObjectByName('visitor')
    if (!visitor)
      return
    visitor.getWorldPosition(at)
    let nearest
    let best = PLOT_REACH
    for (const source of sources) {
      const [x, z] = hexCenter(source.cell)
      const d = Math.hypot(at.x - x, at.z - z)
      if (d < best) {
        best = d
        nearest = source
      }
    }
    if (nearest?.id === s.id)
      return
    stop()
    if (!nearest)
      return
    const element = new Audio()
    element.src = nearest.url
    element.loop = true
    element.preload = 'auto'
    const sound = new PositionalAudio(s.listener)
    sound.setMediaElementSource(element)
    sound.setDistanceModel('linear')
    // The listener is on the camera, a few metres behind the astronaut: full volume anywhere on
    // the plot, softening only for a camera swung far out
    sound.setRefDistance(PLOT_REACH)
    sound.setMaxDistance(PLOT_REACH + HEX)
    sound.setRolloffFactor(1)
    const [x, z] = hexCenter(nearest.cell)
    sound.position.set(x, 1.5, z)
    scene.add(sound)
    s.sound = sound
    s.element = element
    s.id = nearest.id
    onPlaying(nearest.id)
    s.listener.setMasterVolume(mutedIds.includes(nearest.id) ? 0 : 1)
    void s.listener.context.resume()
    element.play().catch(() => { })
  })
  return null
}
