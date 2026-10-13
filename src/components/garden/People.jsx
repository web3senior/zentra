import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Human } from './Human'
// Other people walking the colony (from the realtime process). Positions arrive about ten times a
// second; each astronaut glides toward the latest one so movement looks continuous, and swings its
// limbs while it moves.
function Person({ person, palette, animate, onSelect }) {
  const body = useRef(null)
  const stride = useRef({ phase: 0, amount: 0 })
  const target = useRef(person)
  useEffect(() => { target.current = person }, [person])
  useEffect(() => { body.current?.position.set(person.x, person.y, person.z) }, [])
  useFrame((_, delta) => {
    const group = body.current, goal = target.current
    if (!group)
      return
    // Paused or reduced motion: no gliding, people are drawn where they are
    const k = animate ? 1 - Math.exp(-delta * 12) : 1
    group.position.x += (goal.x - group.position.x) * k
    group.position.y += (goal.y - group.position.y) * k
    group.position.z += (goal.z - group.position.z) * k
    // Turn the short way round
    const turn = Math.atan2(Math.sin(goal.f - group.rotation.y), Math.cos(goal.f - group.rotation.y))
    group.rotation.y += turn * k
    const s = stride.current
    s.amount += ((goal.m ? 1 : 0) - s.amount) * k
    s.phase += delta * 9 * s.amount
  })
  return <Human name={person.name} up={person.up} palette={palette} body={body} stride={stride} animate={animate} objectName={`person:${person.id}`} onSelect={() => onSelect(person.id)}/>
}
export function People({ people, palette, animate, onSelect }) {
  // Drawn on demand while the colony is paused: a new position asks for a frame
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => { invalidate() }, [people, invalidate])
  return <group>{people.map((person) => <Person key={person.id} person={person} palette={palette} animate={animate} onSelect={onSelect}/>)}</group>
}
// Shares the visitor's own pose while signed in with a public name, on the map as well as while
// walking, so people see each other either way: at most ten times a second while it changes, and
// a keep-alive every 10 s (on a timer, so a paused colony that draws no frames stays present).
// Says goodbye when sharing stops.
export function PresenceSync({ realtime, sharing }) {
  const last = useRef({ at: 0, key: '', pose: null, moving: false })
  useEffect(() => {
    if (!realtime)
      return
    if (!sharing) {
      realtime.raw({ t: 'leave' })
      return
    }
    const timer = setInterval(() => {
      const { pose, at } = last.current
      if (pose && performance.now() - at >= 10_000) {
        last.current.at = performance.now()
        realtime.raw({ t: 'move', ...pose, m: false })
      }
    }, 5_000)
    return () => clearInterval(timer)
  }, [realtime, sharing])
  useFrame(({ scene }) => {
    if (!sharing || !realtime)
      return
    const visitor = scene.getObjectByName('visitor')
    const now = performance.now()
    if (!visitor || now - last.current.at < 100)
      return
    const { x, y, z } = visitor.position
    const f = visitor.rotation.y
    const key = [x, y, z, f].map((n) => n.toFixed(2)).join(',')
    const moving = key !== last.current.key
    // Unchanged: nothing to say, except once on stopping so others see the astronaut stand still
    if (!moving && !last.current.moving)
      return
    const pose = { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), f: +f.toFixed(3) }
    last.current = { at: now, key, pose, moving }
    realtime.raw({ t: 'move', ...pose, m: moving })
  })
  return null
}
