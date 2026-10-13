import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { site } from '@/config/site'
import { HEX, PLOT_TOP, hexCenter } from './layout'
import { ScreenSprite, nameArt } from './Resident'
const copy = site.market
const FRAMES = 3
// Hup's NFT market on its own plot: a stall under a striped awning with three glowing art frames
// on easels, turned to face the hub. Selecting it opens the market panel. The frames shimmer in
// turn only while there are listings and animate is on.
export function MarketStall({ market, cell, palette: p, animate, onOpen }) {
  const [x, z] = hexCenter(cell)
  const frames = useRef([])
  const pink = p['edge-pink']
  const glow = useMemo(() => pink.clone().multiplyScalar(1.6), [pink])
  const count = `${new Intl.NumberFormat('en').format(market.count)}${market.more ? '+' : ''}`
  const label = `${copy.title} · ${count} ${copy.forSale}`
  const tag = useMemo(() => () => nameArt(label, p, pink, false), [label, p, pink])
  useFrame(({ clock }) => {
    if (!animate || !market.count)
      return
    frames.current.forEach((frame, i) => { if (frame)
      frame.material.opacity = .65 + .35 * Math.abs(Math.sin(clock.elapsedTime * 1.4 + i * 1.1)); })
  })
  const k = HEX / 5.6
  return <group name="market" position={[x, PLOT_TOP, z]} rotation={[0, Math.atan2(-x, -z), 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 5)
    onOpen(); }}>
  <group scale={k}>
   <mesh position={[0, .12, 0]} castShadow receiveShadow><cylinderGeometry args={[1.9, 2.05, .24, 6]}/><meshStandardMaterial color={p.bubble} metalness={.4} roughness={.4}/></mesh>
   {/* Counter */}
   <mesh position={[0, .7, -.55]} castShadow receiveShadow><boxGeometry args={[3, .9, .7]}/><meshStandardMaterial color={p.hull} roughness={.5}/></mesh>
   <mesh position={[0, 1.17, -.55]}><boxGeometry args={[3.1, .06, .8]}/><meshBasicMaterial color={glow} toneMapped={false}/></mesh>
   {/* Posts and a striped awning */}
   {[-1.5, 1.5].map((side) => <mesh key={side} position={[side, 1.7, -.9]} castShadow><cylinderGeometry args={[.07, .09, 3.2, 8]}/><meshStandardMaterial color={p['hull-shade']}/></mesh>)}
   {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[-1.35 + i * .54, 3.25, -.45]} rotation={[.35, 0, 0]} castShadow><boxGeometry args={[.54, .08, 1.3]}/><meshStandardMaterial color={i % 2 ? p.hull : pink} roughness={.6}/></mesh>)}
   {/* Art frames on easels before the counter */}
   {Array.from({ length: FRAMES }, (_, i) => {
        const fx = (i - 1) * 1.05
        return <group key={i} position={[fx, 0, .55]} rotation={[-.12, (1 - i) * .18, 0]}>
     <mesh position={[0, .7, -.08]} rotation={[-.2, 0, 0]}><cylinderGeometry args={[.035, .035, 1.4, 6]}/><meshStandardMaterial color={p['hull-shade']}/></mesh>
     <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[.82, .82, .06]}/><meshStandardMaterial color={p.hull} roughness={.4}/></mesh>
     <mesh ref={(m) => { frames.current[i] = m; }} position={[0, 1.4, .035]}>
      <planeGeometry args={[.66, .66]}/>
      {market.count ? <meshBasicMaterial color={glow} transparent toneMapped={false}/> : <meshStandardMaterial color={p['hull-shade']} transparent opacity={.35}/>}
     </mesh>
    </group>
      })}
  </group>
  <ScreenSprite draw={tag} height={24} y={4.2 * k}/>
 </group>
}
