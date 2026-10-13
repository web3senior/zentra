import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PLOT_TOP, hexCenter } from './layout'
// The sound device on a plot with music: a small boombox beside the resident. While its track
// plays (and is not muted) the speakers thump, the equalizer bounces and the light glows in the
// plot's colour; otherwise it rests dark. Motion runs only while animate is on.
const BARS = [-.2, -.07, .07, .2]
// onToggle: touching the device mutes or unmutes this plot's music
export function Boombox({ id, cell, tone, palette: p, playing, animate, onToggle }) {
  const [x, z] = hexCenter(cell)
  const cones = useRef([])
  const bars = useRef([])
  const light = useRef(null)
  const edge = p[`edge-${tone}`]
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const on = playing && animate
    // a beat near 112 bpm with a softer off-beat
    const beat = on ? Math.max(0, Math.sin(t * 11.7)) ** 6 + .4 * Math.max(0, Math.sin(t * 11.7 + Math.PI)) ** 6 : 0
    cones.current.forEach((cone) => cone.scale.setScalar(1 + beat * .14))
    bars.current.forEach((bar, i) => { bar.scale.y = on ? .25 + .75 * Math.abs(Math.sin(t * (4 + i * 1.7) + i * 1.3)) : .2; bar.position.y = .2 + .09 * bar.scale.y; })
    if (light.current)
      light.current.material.color.copy(playing ? edge : p['vacant-edge']).multiplyScalar(playing ? 1.6 + beat : 1)
  })
  return <group name={`boombox:${id}`} position={[x + 1.25, PLOT_TOP, z + 1.05]} rotation={[0, .5, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 5)
    onToggle(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
  {/* body, top panel and handle */}
  <mesh position={[0, .32, 0]} castShadow receiveShadow><boxGeometry args={[1.05, .6, .36]}/><meshStandardMaterial color={p.bubble} roughness={.45} metalness={.3}/></mesh>
  <mesh position={[0, .63, 0]}><boxGeometry args={[1.07, .04, .38]}/><meshStandardMaterial color={p['hull-shade']} metalness={.5} roughness={.3}/></mesh>
  <mesh position={[0, .78, 0]} rotation={[0, 0, 0]}><torusGeometry args={[.32, .03, 8, 24, Math.PI]}/><meshStandardMaterial color={p['hull-shade']} metalness={.6} roughness={.3}/></mesh>
  {/* speakers: rim, cone and dust cap on the front */}
  {[-.29, .29].map((sx, i) => <group key={sx} position={[sx, .3, .185]} ref={(g) => { if (g)
      cones.current[i] = g; }}>
   <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.19, .19, .03, 24]}/><meshStandardMaterial color={p['hull-shade']} metalness={.5}/></mesh>
   <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, .005]}><coneGeometry args={[.16, .07, 24, 1, true]}/><meshStandardMaterial color={p.rock} roughness={.9} side={2}/></mesh>
   <mesh position={[0, 0, .02]}><sphereGeometry args={[.045, 12, 8]}/><meshStandardMaterial color={p.space}/></mesh>
  </group>)}
  {/* equalizer between the speakers, and the status light */}
  {BARS.map((bx, i) => <mesh key={bx} ref={(m) => { if (m)
    bars.current[i] = m; }} position={[bx * .42, .22, .19]} scale={[1, .2, 1]}><boxGeometry args={[.035, .18, .02]}/><meshBasicMaterial color={edge} toneMapped={false}/></mesh>)}
  <mesh ref={light} position={[0, .47, .185]}><sphereGeometry args={[.035, 10, 8]}/><meshBasicMaterial color={p['vacant-edge']} toneMapped={false}/></mesh>
  {/* antenna */}
  <mesh position={[.42, .95, -.08]} rotation={[0, 0, -.35]}><cylinderGeometry args={[.008, .012, .6, 6]}/><meshStandardMaterial color={p['hull-shade']} metalness={.7}/></mesh>
 </group>
}
