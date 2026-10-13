import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GROUND, overviewFit, overviewFov } from './layout'
import { Human } from './Human'
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'])
// Shift (or the touch pad's run button, which holds ShiftLeft) runs at this multiple of walking speed
const RUN = 2.8
// Space (or the pad's jump button) jumps under Mars gravity: the push that lifts you about 0.5 m on
// Earth lifts the astronaut about 1.4 m here, with 1.7 s in the air
const GRAVITY = 3.71, JUMP = 3.2
export function Navigation({ mode, reset, focus, ground, start, inputRef, active, visitor, visitorUp, palette, animate }) {
  const { get, invalidate, size } = useThree()
  // focus: the regions' circles; the overview fits them all at this screen shape
  const fit = useMemo(() => overviewFit(focus, size.width / size.height), [focus, size.width, size.height])
  const { x: fx, z: fz, distance } = fit
  // Each visitor arrives at a random point round the home colony's edge (once per page load, so
  // people don't stack up on one spot), facing the hub with the camera behind them
  const [angle] = useState(() => Math.random() * Math.PI * 2)
  const spawn = useMemo(() => { const x = Math.sin(angle) * start, z = Math.cos(angle) * start; return { yaw: angle, x, z, y: ground(x, z) ?? GROUND, facing: angle + Math.PI }; }, [angle, start, ground])
  const pose = useRef({ pitch: .3, drag: null, ...spawn, air: 0, rise: 0 })
  const body = useRef(null)
  const stride = useRef({ phase: 0, amount: 0 })
  const orbit = useRef(null)
  const target = useMemo(() => new Vector3(), [])
  const follow = useCallback((camera) => { const { x, z, yaw, pitch } = pose.current; const y = pose.current.y + pose.current.air; target.set(x, y + 1.4, z); camera.position.set(x + Math.sin(yaw) * Math.cos(pitch) * 5.4, Math.max(y + .4, y + 1.4 + Math.sin(pitch) * 5.4), z + Math.cos(yaw) * Math.cos(pitch) * 5.4); camera.lookAt(target); }, [target])
  const placeBody = useCallback(() => { const { x, y, z, facing, air } = pose.current; body.current?.position.set(x, y + air, z); body.current?.rotation.set(0, facing, 0); }, [])
  useEffect(() => {
    const { camera, gl } = get()
    const canvas = gl.domElement
    const input = inputRef.current
    canvas.tabIndex = 0
    input.invalidate = invalidate
    input.keys.clear()
    if (mode === 'map') {
      const controls = new OrbitControls(camera, canvas)
      orbit.current = controls
      controls.enableDamping = false
      controls.target.set(fx, 0, fz)
      controls.minDistance = 8
      controls.maxDistance = distance * 1.6
      controls.minPolarAngle = .15
      controls.maxPolarAngle = Math.PI * .48
      controls.addEventListener('change', () => invalidate())
      return () => { controls.dispose(); orbit.current = null; input.keys.clear(); input.invalidate = undefined; }
    }
    const down = (e) => { canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); pose.current.drag = [e.clientX, e.clientY]; }
    const move = (e) => { const p = pose.current; if (!p.drag)
      return; p.yaw -= (e.clientX - p.drag[0]) * .004; p.pitch = Math.max(.05, Math.min(1.1, p.pitch + (e.clientY - p.drag[1]) * .004)); p.drag = [e.clientX, e.clientY]; invalidate(); }
    const up = () => { pose.current.drag = null; }
    const keyDown = (e) => { if (movement.has(e.code)) {
      e.preventDefault()
      input.keys.add(e.code)
      if (e.code === 'Space' && !e.repeat)
        input.jump = true
      invalidate()
    } }
    const keyUp = (e) => input.keys.delete(e.code)
    const clear = () => { up(); input.keys.clear(); }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('lostpointercapture', up)
    canvas.addEventListener('keydown', keyDown)
    canvas.addEventListener('keyup', keyUp)
    canvas.addEventListener('blur', clear)
    window.addEventListener('blur', clear)
    return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('keyup', keyUp); canvas.removeEventListener('blur', clear); window.removeEventListener('blur', clear); clear(); input.invalidate = undefined; }
  }, [mode, get, invalidate, inputRef, distance, fx, fz])
  useEffect(() => {
    const { camera, gl } = get()
    const perspective = camera
    if (mode === 'map') {
      camera.position.copy(fit.position)
      orbit.current?.target.set(fx, 0, fz)
      orbit.current?.update()
    }
    else {
      Object.assign(pose.current, { pitch: .3, ...spawn, air: 0, rise: 0 })
      follow(camera)
      gl.domElement.focus({ preventScroll: true })
    }
    placeBody()
    perspective.fov = mode === 'walk' ? 65 : overviewFov(size.width / size.height)
    // Far enough for the sky dome behind the map when zoomed out to the limit
    perspective.far = Math.max(1200, distance * 4)
    perspective.updateProjectionMatrix()
    invalidate()
  }, [mode, reset, get, invalidate, size, fit, distance, fx, fz, spawn, follow, placeBody])
  useEffect(() => { if (!active)
    inputRef.current.keys.clear(); }, [active, inputRef])
  useFrame(({ camera }, delta) => {
    stride.current.amount = Math.max(0, stride.current.amount - delta * 4)
    if (mode !== 'walk' || !active) {
      placeBody()
      return
    }
    const keys = inputRef.current.keys
    const p = pose.current
    const { yaw } = p
    let forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
    let side = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    const length = Math.hypot(forward, side)
    if (length) {
      forward /= length
      side /= length
      const step = Math.min(delta, .04) * 3.2 * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : 1)
      const dx = (Math.cos(yaw) * side - Math.sin(yaw) * forward) * step
      const dz = (-Math.sin(yaw) * side - Math.cos(yaw) * forward) * step
      const hx = ground(p.x + dx, p.z)
      if (hx !== undefined) {
        p.x += dx
        p.y = hx
      }
      const hz = ground(p.x, p.z + dz)
      if (hz !== undefined) {
        p.z += dz
        p.y = hz
      }
      p.facing = Math.atan2(dx, dz)
      stride.current.phase += step * 3.2
      stride.current.amount = 1
      invalidate()
    }
    // air: height above the ground below; rise: upward speed. Steering works in the air.
    if ((keys.has('Space') || inputRef.current.jump) && p.air <= 0 && p.rise <= 0)
      p.rise = JUMP
    inputRef.current.jump = false
    if (p.rise > 0 || p.air > 0) {
      const dt = Math.min(delta, .05)
      p.rise -= GRAVITY * dt
      p.air = Math.max(0, p.air + p.rise * dt)
      if (p.air === 0 && p.rise < 0)
        p.rise = 0
      stride.current.amount = Math.max(stride.current.amount, .35)
      invalidate()
    }
    placeBody()
    follow(camera)
  })
  return <Human name={visitor} up={visitorUp} palette={palette} body={body} stride={stride} animate={animate}/>
}
