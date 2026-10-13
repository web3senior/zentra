import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { SRGBColorSpace, Texture } from 'three'
import { site } from '@/config/site'
import { ScreenSprite, nameArt } from './Resident'
// The UP mark (public/up.png), loaded once and shared by every UP astronaut
let upImage
function loadUpMark() {
  upImage ??= new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = site.upMark.src
  })
  return upImage
}
function useUpMark(up) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!up)
      return
    let live = true
    loadUpMark().then((loaded) => { if (live)
      setImage(loaded); })
    return () => { live = false; }
  }, [up])
  return up ? image : null
}
// A person on the colony: an astronaut with a name tag. The visitor's own avatar is placed by
// Navigation; other people can be drawn from data the same way. Limbs swing with stride.amount
// (0 standing, 1 walking) only while animate is on. up: a verified Universal Profile, drawn as a
// LUKSO-tinted suit with the UP mark on helmet and chest and a UP badge on the name tag.
// objectName: the scene name (the visitor's own is 'visitor'); onSelect makes the astronaut clickable
export function Human({ name, palette: p, body, stride, animate, up = false, objectName = 'visitor', onSelect }) {
  const legs = useRef([])
  const arms = useRef([])
  const image = useUpMark(up)
  // Until the image loads, the tag shows a drawn UP label in its place
  const tag = useMemo(() => () => nameArt(name, p, up ? p['edge-lukso'] : p['edge-pink'], false, image ? { image } : up ? { text: 'UP', color: p['edge-lukso'] } : undefined), [name, p, up, image])
  const mark = useMemo(() => { if (!image)
    return null; const texture = new Texture(image); texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; return texture; }, [image])
  useEffect(() => () => mark?.dispose(), [mark])
  useFrame(() => {
    const { phase, amount } = stride.current
    const swing = animate ? Math.sin(phase) * .6 * amount : 0
    legs.current.forEach((leg, i) => { leg.rotation.x = i ? -swing : swing; })
    arms.current.forEach((arm, i) => { arm.rotation.x = i ? swing * .8 : -swing * .8; })
  })
  const suit = up ? p['up-suit'] : p.hull
  const shade = up ? p['up-shade'] : p['hull-shade']
  return <group ref={body} name={objectName} onClick={onSelect && ((event) => { event.stopPropagation(); if (event.delta < 5)
    onSelect(); })}>
  {[-1, 1].map((side, i) => <group key={side} ref={(g) => { if (g)
      legs.current[i] = g; }} position={[side * .13, .82, 0]}>
   <mesh position={[0, -.4, 0]} castShadow><capsuleGeometry args={[.11, .55, 4, 10]}/><meshStandardMaterial color={suit} roughness={.7}/></mesh>
   <mesh position={[0, -.76, .05]} castShadow><boxGeometry args={[.2, .12, .32]}/><meshStandardMaterial color={shade}/></mesh>
  </group>)}
  <mesh position={[0, 1.18, 0]} castShadow><capsuleGeometry args={[.27, .42, 6, 14]}/><meshStandardMaterial color={suit} roughness={.7}/></mesh>
  {mark
      ? <mesh position={[0, 1.27, .272]}><planeGeometry args={[.22, .22]}/><meshBasicMaterial map={mark} transparent toneMapped={false}/></mesh>
      : <mesh position={[0, 1.28, .24]}><boxGeometry args={[.24, .14, .06]}/><meshBasicMaterial color={p['edge-pink']} toneMapped={false}/></mesh>}
  <mesh position={[0, 1.22, -.3]} castShadow><boxGeometry args={[.46, .56, .22]}/><meshStandardMaterial color={shade} roughness={.6}/></mesh>
  {[-1, 1].map((side, i) => <group key={side} ref={(g) => { if (g)
      arms.current[i] = g; }} position={[side * .37, 1.45, 0]}>
   <mesh position={[0, -.3, 0]} castShadow><capsuleGeometry args={[.085, .46, 4, 10]}/><meshStandardMaterial color={suit} roughness={.7}/></mesh>
  </group>)}
  <mesh position={[0, 1.78, 0]} castShadow><sphereGeometry args={[.27, 24, 16]}/><meshStandardMaterial color={suit} roughness={.4}/></mesh>
  <mesh position={[0, 1.79, .12]} scale={[1, .8, .7]}><sphereGeometry args={[.2, 24, 16]}/><meshStandardMaterial color={p.visor} metalness={.8} roughness={.15} emissive={p.visor} emissiveIntensity={.15}/></mesh>
  {/* The UP mark on the crown of the helmet, facing up and forward */}
  {mark && <mesh position={[0, 2.0, .1]} rotation={[-1.05, 0, 0]}><planeGeometry args={[.16, .16]}/><meshBasicMaterial map={mark} transparent toneMapped={false}/></mesh>}
  <ScreenSprite draw={tag} height={22} y={2.35}/>
 </group>
}
