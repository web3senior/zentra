import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, EdgesGeometry, ExtrudeGeometry, Object3D } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { HEX, PLOT_TOP, hexCenter, random } from './layout'
import { ScreenSprite, nameArt } from './Resident'
// A chain district's centre: the chain's logo as a floating, turning 3D emblem inside two orbiting
// rings of light and a swarm of shards, over a hologram beam rising from a stepped pedestal.
// The logo file comes from config/chains.js; its colour is the chain's brand token. Motion runs
// only while animate is on.
const SHARDS = 14
function Emblem({ url, color }) {
  const svg = useLoader(SVGLoader, url)
  const art = useMemo(() => {
    const shapes = svg.paths.flatMap((path) => SVGLoader.createShapes(path))
    // Logos come at any size (LUKSO's is 250 units tall, Monad's 20): measure, then extrude in proportion
    const ys = shapes.flatMap((shape) => shape.getPoints().map((point) => point.y))
    const height = Math.max(...ys) - Math.min(...ys) || 1
    const solid = new ExtrudeGeometry(shapes, { depth: height * .145, bevelEnabled: true, bevelThickness: height * .024, bevelSize: height * .016, bevelSegments: 3, curveSegments: 24 })
    solid.center()
    return { solid, edges: new EdgesGeometry(solid, 30), height }
  }, [svg])
  useEffect(() => () => { art.solid.dispose(); art.edges.dispose(); }, [art])
  // SVG units, y down: scale to about 3.6 units tall and flip upright
  const s = 3.6 / art.height
  return <group scale={[s, -s, s]}>
  <mesh geometry={art.solid} castShadow><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.22} metalness={.6} roughness={.22}/></mesh>
  <lineSegments geometry={art.edges}><lineBasicMaterial color={color.clone().multiplyScalar(2.2)} toneMapped={false}/></lineSegments>
 </group>
}
// onOpen: selecting the monument (logo, rings or label) opens the network's details
// A column of the chain's colour from the monument into the sky, so each network is recognisable
// from across the colony. It ignores the haze (no fog), fades towards the top through a gradient
// alpha map (normal blending: additive light over the orange ground would shift every hue to pink),
// and pulses gently while animate is on.
const BEAM = 160
// base: where the column starts, above the emblem and its rings so the logo stays clear
function SkyBeam({ color, animate, seed, base }) {
  const core = useRef(null)
  const halo = useRef(null)
  const fade = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    // white is opaque in an alpha map: bright at the base, gone at the top (texture v runs bottom to top)
    const g = ctx.createLinearGradient(0, 256, 0, 0)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(.35, 'rgba(255,255,255,.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
    return new CanvasTexture(canvas)
  }, [])
  useEffect(() => () => fade.dispose(), [fade])
  useFrame(({ clock }) => {
    if (!animate)
      return
    const t = clock.elapsedTime + seed
    if (core.current)
      core.current.material.opacity = .72 + .15 * Math.sin(t * 1.3)
    if (halo.current) {
      halo.current.material.opacity = .24 + .08 * Math.sin(t * .9 + 1)
      halo.current.rotation.y = t * .2
    }
  })
  // the true hue: brightening a saturated colour (Monad's purple) washes it out to white when added
  const bright = useMemo(() => color.clone().multiplyScalar(1.15), [color])
  return <group position={[0, base + BEAM / 2, 0]}>
  <mesh ref={core}><cylinderGeometry args={[.35, .55, BEAM, 12, 1, true]}/><meshBasicMaterial color={bright} alphaMap={fade} transparent opacity={.75} depthWrite={false} fog={false} toneMapped={false} side={2}/></mesh>
  <mesh ref={halo}><cylinderGeometry args={[1.6, 2.4, BEAM, 16, 1, true]}/><meshBasicMaterial color={color} alphaMap={fade} transparent opacity={.26} depthWrite={false} fog={false} toneMapped={false} side={2}/></mesh>
 </group>
}
export function Monument({ palette: p, region, color, logo, label, animate, onOpen }) {
  const [x, z] = hexCenter(region.center)
  const emblem = useRef(null)
  const ringA = useRef(null)
  const ringB = useRef(null)
  const beam = useRef(null)
  const shards = useRef(null)
  const glow = useMemo(() => color.clone().multiplyScalar(1.8), [color])
  const tag = useMemo(() => () => nameArt(label, p, color, false), [label, p, color])
  const seeds = useMemo(() => Array.from({ length: SHARDS }, (_, i) => ({ a: random(i) * Math.PI * 2, r: 2.6 + random(i + 3) * .9, y: 4.2 + (random(i + 7) - .5) * 2.6, s: .4 + random(i + 1) * .6 })), [])
  const placeShards = (t) => {
    const mesh = shards.current
    if (!mesh)
      return
    const o = new Object3D()
    seeds.forEach((f, i) => { const a = f.a + t * f.s * .5; o.position.set(Math.cos(a) * f.r, f.y + Math.sin(t * f.s + i) * .25, Math.sin(a) * f.r); o.rotation.set(t * f.s, t * f.s * .7, 0); o.scale.setScalar(.09 + .05 * Math.abs(Math.sin(t * f.s * 2 + i))); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); })
    mesh.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => placeShards(0))
  useFrame(({ clock }) => {
    if (!animate)
      return
    const t = clock.elapsedTime
    if (emblem.current) {
      emblem.current.rotation.y = t * .45
      emblem.current.position.y = 4.3 + Math.sin(t * .9) * .18
    }
    if (ringA.current) {
      ringA.current.rotation.z = t * .5
      ringA.current.rotation.x = 1.15 + Math.sin(t * .3) * .08
    }
    if (ringB.current) {
      ringB.current.rotation.z = -t * .38
      ringB.current.rotation.x = 1.9 + Math.cos(t * .25) * .08
    }
    if (beam.current)
      beam.current.material.opacity = .07 + .03 * Math.sin(t * 1.7)
    placeShards(t)
  })
  // Pedestal and beam scale with the plot so the monument fills the district's centre
  const k = HEX / 5.6
  return <group name={`monument:${label.toLowerCase()}`} position={[x, PLOT_TOP, z]} onClick={(event) => { event.stopPropagation(); if (event.delta < 5)
    onOpen(); }}>
  <group scale={k}>
   <mesh position={[0, .15, 0]} castShadow receiveShadow><cylinderGeometry args={[2.6, 2.8, .3, 6]}/><meshStandardMaterial color={p.bubble} metalness={.5} roughness={.35}/></mesh>
   <mesh position={[0, .5, 0]} castShadow receiveShadow><cylinderGeometry args={[1.8, 2, .4, 6]}/><meshStandardMaterial color={p.bubble} metalness={.5} roughness={.3}/></mesh>
   <mesh rotation={[-Math.PI / 2, 0, Math.PI / 6]} position={[0, .31, 0]}><ringGeometry args={[2.25, 2.4, 6]}/><meshBasicMaterial color={glow} toneMapped={false}/></mesh>
   <mesh rotation={[-Math.PI / 2, 0, Math.PI / 6]} position={[0, .71, 0]}><ringGeometry args={[1.45, 1.58, 6]}/><meshBasicMaterial color={glow} toneMapped={false}/></mesh>
   <mesh ref={beam} position={[0, 1.6, 0]}><cylinderGeometry args={[.9, 1.4, 1.8, 6, 1, true]}/><meshBasicMaterial color={color} transparent opacity={.08} blending={AdditiveBlending} depthWrite={false} side={2} toneMapped={false}/></mesh>
   <group ref={emblem} position={[0, 4.3, 0]}>{logo ? <Suspense fallback={null}><Emblem url={logo} color={color}/></Suspense> : <mesh><octahedronGeometry args={[1.2, 0]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.6}/></mesh>}</group>
   <mesh ref={ringA} position={[0, 4.3, 0]} rotation={[1.15, 0, 0]}><torusGeometry args={[2.7, .05, 8, 96]}/><meshBasicMaterial color={glow} toneMapped={false} transparent opacity={.5} depthWrite={false}/></mesh>
   <mesh ref={ringB} position={[0, 4.3, 0]} rotation={[1.9, 0, 0]}><torusGeometry args={[3.1, .035, 8, 96]}/><meshBasicMaterial color={glow} toneMapped={false} transparent opacity={.38} depthWrite={false}/></mesh>
   <instancedMesh ref={shards} args={[undefined, undefined, SHARDS]} frustumCulled={false}><octahedronGeometry args={[1, 0]}/><meshBasicMaterial color={glow} toneMapped={false}/></instancedMesh>
  </group>
  <SkyBeam color={color} animate={animate} seed={x * .1 + z * .07} base={8.2 * k}/>
  <ScreenSprite draw={tag} height={28} y={8 * k}/>
 </group>
}
