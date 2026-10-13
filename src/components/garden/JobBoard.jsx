import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { site } from '@/config/site'
import { HEX, PLOT_TOP, hexCenter } from './layout'
import { ScreenSprite, nameArt } from './Resident'
const copy = site.garden.jobs
const CARDS = 6
// A chain's job board on its own plot: a framed notice board under a little roof, one glowing
// card per open job (up to six) and dim cards for the rest, turned to face the hub. Selecting it
// opens the board's list. The lamp on top pulses only while jobs are open and animate is on.
export function JobBoard({ board, cell, palette: p, animate, onOpen }) {
  const [x, z] = hexCenter(cell)
  const lamp = useRef(null)
  const lit = Math.min(board.open, CARDS)
  const gold = p['edge-gold']
  const glow = useMemo(() => gold.clone().multiplyScalar(1.6), [gold])
  const label = `${copy.title} · ${new Intl.NumberFormat('en').format(board.open)} ${copy.openCount}`
  const tag = useMemo(() => () => nameArt(label, p, gold, false), [label, p, gold])
  useFrame(({ clock }) => {
    if (animate && lamp.current)
      lamp.current.scale.setScalar(board.open ? .8 + .35 * Math.abs(Math.sin(clock.elapsedTime * 1.8)) : .8)
  })
  const k = HEX / 5.6
  return <group name={`jobs:${board.id}`} position={[x, PLOT_TOP, z]} rotation={[0, Math.atan2(-x, -z), 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 5)
    onOpen(); }}>
  <group scale={k}>
   <mesh position={[0, .12, 0]} castShadow receiveShadow><cylinderGeometry args={[1.9, 2.05, .24, 6]}/><meshStandardMaterial color={p.bubble} metalness={.4} roughness={.4}/></mesh>
   {[-1, 1].map((side) => <mesh key={side} position={[side * 1.45, 1.55, 0]} castShadow><cylinderGeometry args={[.08, .1, 2.9, 8]}/><meshStandardMaterial color={p['hull-shade']}/></mesh>)}
   <mesh position={[0, 3.12, 0]} rotation={[.12, 0, 0]} castShadow><boxGeometry args={[3.5, .12, .7]}/><meshStandardMaterial color={p.hull}/></mesh>
   <mesh position={[0, 2.05, 0]} castShadow><boxGeometry args={[3.1, 1.85, .12]}/><meshStandardMaterial color={p.bubble} roughness={.5}/></mesh>
   {/* Glowing frame */}
   {[[0, 2.99, 3.2, .06], [0, 1.11, 3.2, .06], [-1.57, 2.05, .06, 1.94], [1.57, 2.05, .06, 1.94]].map(([fx, fy, w, h], i) => <mesh key={i} position={[fx, fy, .07]}><boxGeometry args={[w, h, .02]}/><meshBasicMaterial color={glow} toneMapped={false}/></mesh>)}
   {/* Notice cards: lit for open jobs, dim for the rest */}
   {Array.from({ length: CARDS }, (_, i) => <mesh key={i} position={[-1 + (i % 3), 2.48 - Math.floor(i / 3) * .82, .075]} rotation={[0, 0, (i % 2 ? 1 : -1) * .05]}>
    <planeGeometry args={[.72, .56]}/>
    {i < lit ? <meshBasicMaterial color={glow} toneMapped={false}/> : <meshStandardMaterial color={p['hull-shade']} transparent opacity={.35}/>}
   </mesh>)}
   <mesh ref={lamp} position={[0, 3.32, 0]}><sphereGeometry args={[.13, 12, 8]}/><meshBasicMaterial color={board.open ? glow : p['vacant-edge']} toneMapped={false}/></mesh>
  </group>
  <ScreenSprite draw={tag} height={24} y={4.2 * k}/>
 </group>
}
