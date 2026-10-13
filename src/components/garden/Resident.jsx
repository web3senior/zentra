import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { PLOT_TOP, hexCenter } from './layout'
const glyphFor = (status) => status === 'working' || status === 'using_tool' ? 'hammer' : status === 'thinking' ? 'question' : status === 'sleeping' || status === 'offline' ? 'sleep' : status === 'error' ? 'alert' : 'check'
// Sprites drawn on a canvas keep a constant on-screen height in overview and walk alike and,
// like map labels, draw over buildings
const spot = new Vector3()
// far: hide beyond this camera distance (name tags would pile up in a distant overview)
export function ScreenSprite({ draw, height, y, x = 0, z = 0, far = Infinity }) {
  const art = useMemo(() => { const { canvas, aspect } = draw(); const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; return { texture, aspect }; }, [draw])
  useEffect(() => () => art.texture.dispose(), [art])
  const sprite = useRef(null)
  useFrame(({ camera, size }) => { const s = sprite.current; if (!s)
    return; const h = height * Math.min(1, Math.max(.55, size.width / 1000)) / size.height * 2 * Math.tan(camera.fov * Math.PI / 360); s.scale.set(h * art.aspect, h, 1); if (far < Infinity)
    s.visible = s.getWorldPosition(spot).distanceTo(camera.position) < far; })
  return <sprite ref={sprite} position={[x, y, z]} renderOrder={2}><spriteMaterial map={art.texture} sizeAttenuation={false} transparent depthTest={false} depthWrite={false} toneMapped={false} fog={false}/></sprite>
}
const css = (c) => c.getStyle()
function bubbleArt(glyph, p, selected) {
  const s = 2, w = 64 * s, h = 74 * s, canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = css(p.bubble)
  ctx.strokeStyle = css(selected ? p.lamp : p.hull)
  ctx.lineWidth = 3 * s
  ctx.beginPath()
  ctx.roundRect(3 * s, 3 * s, w - 6 * s, w - 6 * s, 12 * s)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w / 2 - 9 * s, w - 4.5 * s)
  ctx.lineTo(w / 2, h - 3 * s)
  ctx.lineTo(w / 2 + 9 * s, w - 4.5 * s)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = css(p.bubble)
  ctx.fillRect(w / 2 - 7.5 * s, w - 9 * s, 15 * s, 6 * s)
  const c = w / 2, ink = css(glyph === 'alert' ? p['edge-pink'] : glyph === 'question' ? p['edge-gold'] : p.hull)
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (glyph === 'hammer') {
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(-Math.PI / 4)
    ctx.fillRect(-2.5 * s, -6 * s, 5 * s, 26 * s)
    ctx.beginPath()
    ctx.roundRect(-12 * s, -15 * s, 24 * s, 10 * s, 2 * s)
    ctx.fill()
    ctx.restore()
  }
  else if (glyph === 'check') {
    ctx.lineWidth = 6 * s
    ctx.beginPath()
    ctx.moveTo(c - 13 * s, c + 1 * s)
    ctx.lineTo(c - 4 * s, c + 10 * s)
    ctx.lineTo(c + 14 * s, c - 10 * s)
    ctx.stroke()
  }
  else {
    ctx.font = `700 ${glyph === 'sleep' ? 30 * s : 36 * s}px ${getComputedStyle(document.body).fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph === 'question' ? '?' : glyph === 'sleep' ? 'Z' : '!', c, c + 2 * s)
  }
  return { canvas, aspect: w / h }
}
// badge: a mark before the text, either { image } (a loaded image, e.g. the UP mark for Universal
// Profiles) or { text, color } drawn as a short label in a pill of that colour
export function nameArt(text, p, dot, selected, badge) {
  const s = 2, font = `600 ${26 * s}px ${getComputedStyle(document.body).fontFamily}`, small = `800 ${18 * s}px ${getComputedStyle(document.body).fontFamily}`, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
  ctx.font = small
  const pill = badge?.image ? 30 * s : badge ? Math.ceil(ctx.measureText(badge.text).width) + 16 * s : 0, gap = badge ? pill + 8 * s : 0
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 56 * s + gap, h = 44 * s
  canvas.width = w
  canvas.height = h
  if (selected) {
    ctx.fillStyle = css(p.lamp)
    ctx.beginPath()
    ctx.roundRect(2 * s, 2 * s, w - 4 * s, h - 4 * s, h / 2)
    ctx.fill()
  }
  ctx.fillStyle = css(selected ? p.ink : dot)
  ctx.beginPath()
  ctx.arc(20 * s, h / 2, 5 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.shadowColor = css(p.space)
  ctx.shadowBlur = selected ? 0 : 6 * s
  ctx.fillStyle = css(selected ? p.ink : p.hull)
  if (badge?.image) {
    ctx.shadowBlur = 0
    ctx.drawImage(badge.image, 34 * s, h / 2 - 15 * s, pill, pill)
    ctx.shadowBlur = selected ? 0 : 6 * s
  }
  else if (badge) {
    ctx.shadowBlur = 0
    ctx.fillStyle = css(badge.color)
    ctx.beginPath()
    ctx.roundRect(34 * s, h / 2 - 13 * s, pill, 26 * s, 13 * s)
    ctx.fill()
    ctx.font = small
    ctx.fillStyle = css(p.hull)
    ctx.textAlign = 'center'
    ctx.fillText(badge.text, 34 * s + pill / 2, h / 2 + s)
    ctx.textAlign = 'left'
    ctx.font = font
    ctx.shadowBlur = selected ? 0 : 6 * s
    ctx.fillStyle = css(selected ? p.ink : p.hull)
  }
  ctx.fillText(text, 34 * s + gap, h / 2 + s)
  return { canvas, aspect: w / h }
}
// cell: the agent's plot; tone: its plot's colour, which also lights the robot's face; index
// varies the motion phase
export function GardenAgent({ agent, index, cell, tone, palette: p, animate, selected, onSelect }) {
  const [x, z] = hexCenter(cell)
  const asleep = agent.status === 'sleeping' || agent.status === 'offline'
  const busy = agent.status === 'working' || agent.status === 'using_tool'
  const glyph = glyphFor(agent.status)
  const edge = p[`edge-${tone}`]
  const bubble = useMemo(() => () => bubbleArt(glyph, p, selected), [glyph, p, selected])
  const name = useMemo(() => () => nameArt(agent.name, p, edge, selected), [agent.name, p, edge, selected])
  const body = useRef(null)
  const head = useRef(null)
  const arms = useRef([])
  const ring = useRef(null)
  const float = useRef(null)
  useFrame(({ clock }) => {
    if (!animate)
      return
    const t = clock.elapsedTime + index * 1.3
    // A hovering bot: it bobs while awake and settles low while paused
    if (body.current) {
      body.current.position.y = asleep ? 0 : .06 + Math.sin(t * (busy ? 7 : 1.7)) * (busy ? .015 : .04)
      body.current.scale.y = asleep ? 1 + Math.sin(t * 1.3) * .02 : 1
    }
    if (head.current)
      head.current.rotation.y = asleep ? 0 : busy ? Math.sin(t * 2.5) * .06 : Math.sin(t * .45) * .35
    arms.current.forEach((arm, i) => {
      if (!arm)
        return
      const side = i ? 1 : -1
      // Busy: both hands typing at the laptop. Idle: one hand waves now and then
      arm.rotation.x = busy ? -1.25 + Math.sin(t * 14 + i * 2) * .08 : 0
      const waving = !busy && !asleep && side === -1 && Math.sin(t * .5) > .2
      arm.rotation.z = waving ? side * (1.9 + Math.sin(t * 7) * .35) : asleep ? 0 : side * Math.sin(t * 1.7 + i) * .06
    })
    if (float.current)
      float.current.position.y = Math.sin(t * 1.6) * .08
    if (ring.current)
      ring.current.scale.setScalar(selected ? 1 + Math.sin(t * 3) * .06 : 1)
  })
  const shell = <meshStandardMaterial color={p.robot} roughness={.35} metalness={.05}/>
  const panel = <meshStandardMaterial color={p['robot-shade']}/>
  const joint = <meshStandardMaterial color={p['robot-joint']} roughness={.6}/>
  const face = <meshStandardMaterial color={edge} emissive={edge} emissiveIntensity={busy ? 1.4 : .8} toneMapped={false}/>
  return <group name={`resident:${agent.id}`} position={[x, PLOT_TOP, z]} rotation={[0, .25, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 5)
    onSelect(agent.id); }}>
  <group ref={ring}><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .01, 0]}><ringGeometry args={[.62, .68, 40]}/><meshBasicMaterial color={selected ? p.lamp : edge} toneMapped={false} transparent opacity={selected ? .95 : .5}/></mesh></group>
  <group ref={body} position={[0, asleep ? 0 : .06, 0]}>
   {/* Egg-shaped body with two panel seams */}
   <mesh position={[0, .5, 0]} scale={[1, 1, .9]} castShadow><capsuleGeometry args={[.32, .3, 8, 20]}/>{shell}</mesh>
   {[-1, 1].map((side) => <mesh key={side} position={[side * .13, .55, .28]} rotation={[0, side * .4, 0]}><capsuleGeometry args={[.012, .32, 4, 6]}/>{panel}</mesh>)}
   {/* Arms hang from the shoulders: a dark link, a white forearm and a dark mitt */}
   {[-1, 1].map((side, i) => <group key={side} ref={(node) => { arms.current[i] = node; }} position={[side * .31, .66, 0]}>
    <mesh position={[side * .07, -.02, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.035, .035, .14, 8]}/>{joint}</mesh>
    <mesh position={[side * .16, -.16, 0]} castShadow><capsuleGeometry args={[.065, .16, 4, 10]}/>{shell}</mesh>
    <mesh position={[side * .16, -.34, 0]} scale={[1, 1.1, .8]}><sphereGeometry args={[.06, 10, 8]}/>{joint}</mesh>
   </group>)}
   <group ref={head} position={[0, asleep ? 1.02 : 1.12, 0]} rotation={[asleep ? .3 : busy ? .15 : 0, 0, 0]}>
    <mesh scale={[.5, .42, .44]} castShadow><sphereGeometry args={[1, 24, 16]}/>{shell}</mesh>
    {/* Ear discs and the two slots on the crown */}
    {[-1, 1].map((side) => <group key={side}>
     <mesh position={[side * .49, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.09, .09, .05, 16]}/>{panel}</mesh>
     <mesh position={[side * .12, .33, .2]} rotation={[-.6, 0, 0]}><capsuleGeometry args={[.018, .07, 4, 6]}/>{panel}</mesh>
    </group>)}
    {/* The face: a dark screen with glowing arc eyes and a small smile */}
    <mesh position={[0, -.03, .31]} scale={[.35, .2, .15]}><sphereGeometry args={[1, 24, 12]}/><meshStandardMaterial color={p['robot-screen']} roughness={.2} metalness={.3}/></mesh>
    {[-1, 1].map((side) => asleep
      ? <mesh key={side} position={[side * .12, -.01, .46]}><boxGeometry args={[.09, .016, .01]}/>{face}</mesh>
      : <mesh key={side} position={[side * .12, -.02, .455]}><torusGeometry args={[.045, .012, 6, 14, Math.PI]}/>{face}</mesh>)}
    {!asleep && <mesh position={[0, -.1, .45]} scale={[1, .6, .4]}><sphereGeometry args={[.035, 10, 8]}/>{face}</mesh>}
   </group>
  </group>
  {busy && <group position={[0, 0, .62]}>
   <mesh position={[0, .2, 0]} castShadow><boxGeometry args={[.62, .05, .4]}/><meshStandardMaterial color={p.stone} roughness={.6}/></mesh>
   <mesh position={[0, .4, .2]} rotation={[.35, 0, 0]}><boxGeometry args={[.62, .4, .03]}/><meshStandardMaterial color={p.stone}/></mesh>
   <mesh position={[0, .4, .18]} rotation={[.35, Math.PI, 0]}><planeGeometry args={[.54, .32]}/><meshBasicMaterial color={p.blue} toneMapped={false}/></mesh>
  </group>}
  <group ref={float}><ScreenSprite draw={bubble} height={46} y={asleep ? 2.1 : 2.75}/></group>
  <ScreenSprite draw={name} height={22} y={.45} x={-1.2} z={-2} far={selected ? Infinity : 48}/>
 </group>
}
