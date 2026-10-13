import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Float32BufferAttribute, Object3D, PlaneGeometry, Shape, Path } from 'three'
import { HEX, PLOT_TOP, hexCenter, random, regionCells, spiral } from './layout'
import { plotTones } from './palette'
// One instanced mesh per geometry, so a colony of any size costs a handful of draw calls
export function Batch({ items, children, glow = false, shadows = true }) {
  const ref = useRef(null)
  useLayoutEffect(() => { const mesh = ref.current; if (!mesh)
    return; const object = new Object3D(); items.forEach((item, index) => { object.position.set(...item.at); object.scale.set(...item.size); object.rotation.set(...(item.rotation ?? [0, 0, 0])); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix); mesh.setColorAt(index, item.color); }); mesh.count = items.length; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor)
    mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere(); }, [items])
  if (!items.length)
    return null
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={shadows && !glow} receiveShadow={shadows && !glow}>{children}{glow ? <meshBasicMaterial toneMapped={false}/> : <meshStandardMaterial roughness={.75} metalness={.1}/>}</instancedMesh>
}
// Rounded pointy-top hexagon, the plot shape owners will rent
export function roundedHex(radius, corner, path) {
  const corners = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return [Math.cos(a) * radius, Math.sin(a) * radius]; })
  corners.forEach(([x, y], i) => {
    const [px, py] = corners[(i + 5) % 6], [nx, ny] = corners[(i + 1) % 6]
    const toPrev = Math.hypot(px - x, py - y), toNext = Math.hypot(nx - x, ny - y)
    const a = [x + (px - x) / toPrev * corner, y + (py - y) / toPrev * corner], b = [x + (nx - x) / toNext * corner, y + (ny - y) / toNext * corner]
    if (i === 0)
      path.moveTo(...a)
    else
      path.lineTo(...a)
    path.quadraticCurveTo(x, y, ...b)
  })
  path.closePath()
  return path
}
export function MoonSurface({ palette: p, reach }) {
  const ground = useMemo(() => {
    const flat = reach + 2
    const size = 2 * (reach + 70), g = new PlaneGeometry(size, size, Math.ceil(size / 1.6), Math.ceil(size / 1.6))
    g.rotateX(-Math.PI / 2)
    const position = g.attributes.position
    const colors = []
    const c = new Color()
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i), d = Math.hypot(x, z)
      const rise = Math.max(0, Math.min(1, (d - flat) / 22))
      const y = rise * rise * (Math.sin(x * .07) * Math.cos(z * .06) * 5 + Math.sin(x * .19 + z * .13) * 1.6 + 4) + (Math.sin(x * .9) * Math.cos(z * .8)) * .05
      position.setY(i, y - .02)
      c.copy(p.regolith).lerp(p['regolith-dark'], Math.min(1, .15 + random(i) * .25 + Math.max(0, -y) * .2 + rise * .15))
      colors.push(c.r, c.g, c.b)
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [p, reach])
  useEffect(() => () => ground.dispose(), [ground])
  const scatter = useMemo(() => {
    const flat = reach
    const rocks = []
    const rims = []
    const pits = []
    for (let i = 0; i < 420; i++) {
      const a = random(i) * Math.PI * 2, d = flat + 1 + random(i + .7) * 60, s = .15 + random(i + .3) ** 3 * 1.6
      rocks.push({ at: [Math.cos(a) * d, s * .3, Math.sin(a) * d], size: [s, s * .7, s * 1.1], rotation: [random(i + 1), random(i + 2) * 3, 0], color: p.rock.clone().lerp(p['regolith-dark'], random(i + 5) * .6) })
    }
    for (let i = 0; i < 46; i++) {
      const a = random(i * 3.3) * Math.PI * 2, d = flat + 3 + random(i * 5.1) * 55, s = 1 + random(i * 7.9) ** 2 * 5, x = Math.cos(a) * d, z = Math.sin(a) * d
      rims.push({ at: [x, .02, z], size: [s, s, s * .5], rotation: [-Math.PI / 2, 0, 0], color: p.regolith.clone().lerp(p.hull, .08) })
      pits.push({ at: [x, .03, z], size: [s * .92, s * .92, 1], rotation: [-Math.PI / 2, 0, 0], color: p['regolith-dark'] })
    }
    return { rocks, rims, pits }
  }, [p, reach])
  return <group>
  <mesh geometry={ground} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
  <Batch items={scatter.rocks}><dodecahedronGeometry args={[1, 0]}/></Batch>
  <Batch items={scatter.rims} shadows={false}><torusGeometry args={[1, .12, 6, 28]}/></Batch>
  <Batch items={scatter.pits} shadows={false}><circleGeometry args={[1, 28]}/></Batch>
 </group>
}
const lit = (plot) => !!plot.owner && plot.owner.status !== 'sleeping' && plot.owner.status !== 'offline'
export const toneFor = (index) => plotTones[(index - 1) % plotTones.length]
const seedFor = (key) => [...key].reduce((sum, c, i) => sum + c.charCodeAt(0) * (i + 1), 0)
// Every plot: a low rounded-hex platform with a glowing border. Vacant plots are grey and dim.
// Plots are scenery: only a resident itself (its character, name tag or bubble) opens its panel
export function Plots({ palette: p, plots, selected }) {
  const shapes = useMemo(() => { const outer = roundedHex(HEX * .94, 1.1, new Shape()); const rim = roundedHex(HEX * .94, 1.1, new Shape()); rim.holes.push(roundedHex(HEX * .94 - .15, 1.05, new Path())); return { outer, rim }; }, [])
  return <group>{plots.map((plot) => {
      const [x, z] = hexCenter(plot.cell)
      const hub = plot.kind !== 'plot'
      const tone = plot.tone
      const on = lit(plot)
      const floor = hub ? p.bubble : on ? p[`plot-${tone}`] : p.vacant
      const edge = plot.kind === 'hub' ? p.hull : plot.kind === 'beacon' || plot.kind === 'jobs' || plot.kind === 'market' ? p[`edge-${tone}`] : on ? p[`edge-${tone}`] : p['vacant-edge']
      const chosen = !!plot.owner && plot.owner.id === selected
      return <group key={plot.key} position={[x, 0, z]}>
   <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PLOT_TOP - .14, 0]} receiveShadow><extrudeGeometry args={[shapes.outer, { depth: .14, bevelEnabled: true, bevelSize: .05, bevelThickness: .04, bevelSegments: 2, curveSegments: 6 }]}/><meshStandardMaterial color={floor} roughness={.85}/></mesh>
   <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PLOT_TOP + .045, 0]}><shapeGeometry args={[shapes.rim, 6]}/><meshBasicMaterial color={chosen ? p.lamp.clone().multiplyScalar(1.6) : edge.clone().multiplyScalar(on || hub ? 1.25 : plot.owner ? .95 : .8)} toneMapped={false} transparent opacity={on || hub ? 1 : plot.owner ? .85 : .55}/></mesh>
  </group>
    })}</group>
}
// Habitat modules on each owned plot (domes, pods, tanks, panels, antennae), laid out from the
// plot index so a plot always looks the same. The centre stays clear for the resident.
export function Modules({ palette: p, plots }) {
  const batches = useMemo(() => {
    const domes = [], caps = [], pods = [], tanks = [], panels = [], poles = [], lights = []
    plots.filter((plot) => plot.owner).forEach((plot) => {
      const [cx, cz] = hexCenter(plot.cell)
      const seed = seedFor(plot.key) * .137
      const turn = random(seed) * Math.PI * 2
      const count = 3 + Math.floor(random(seed + 1) * 2)
      for (let k = 0; k < count; k++) {
        const a = turn + k * Math.PI * 2 / count + random(seed + k) * .4, d = 1.55 + random(seed + k * 2) * .5, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, kind = Math.floor(random(seed + k * 3) * 4)
        if (kind === 0) {
          const s = .55 + random(seed + k) * .25
          domes.push({ at: [x, PLOT_TOP, z], size: [s, s * .85, s], color: p.hull })
          caps.push({ at: [x, PLOT_TOP + s * .85, z], size: [s * .45, s * .2, s * .45], color: p.dome })
        }
        else if (kind === 1) {
          pods.push({ at: [x, PLOT_TOP + .35, z], size: [.5, .7, .5], color: p.hull })
          caps.push({ at: [x, PLOT_TOP + .72, z], size: [.42, .12, .42], color: p['hull-shade'] })
          lights.push({ at: [x, PLOT_TOP + .4, z + .5], size: [.12, .12, .04], color: p.glass.clone().multiplyScalar(1.4) })
        }
        else if (kind === 2) {
          tanks.push({ at: [x, PLOT_TOP + .32, z], size: [.32, .32, .32], color: k % 2 ? p['hull-shade'] : p.dome })
          tanks.push({ at: [x + .4, PLOT_TOP + .24, z + .15], size: [.24, .24, .24], color: p.hull })
        }
        else {
          panels.push({ at: [x, PLOT_TOP + .45, z], size: [.9, .04, .55], rotation: [.5, a, 0], color: p.glass.clone().lerp(p.bubble, .55) })
          poles.push({ at: [x, PLOT_TOP + .22, z], size: [.05, .44, .05], color: p['hull-shade'] })
        }
      }
      const ax = cx + Math.cos(turn + .9) * 2.3, az = cz + Math.sin(turn + .9) * 2.3
      poles.push({ at: [ax, PLOT_TOP + .7, az], size: [.04, 1.4, .04], color: p['hull-shade'] })
      lights.push({ at: [ax, PLOT_TOP + 1.44, az], size: [.08, .08, .08], color: lit(plot) ? p[`edge-${plot.tone}`].clone().multiplyScalar(1.6) : p['vacant-edge'] })
    })
    return { domes, caps, pods, tanks, panels, poles, lights }
  }, [p, plots])
  return <group>
  <Batch items={batches.domes}><sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]}/></Batch>
  <Batch items={batches.caps}><cylinderGeometry args={[1, 1, 1, 16]}/></Batch>
  <Batch items={batches.pods}><cylinderGeometry args={[1, 1, 1, 8]}/></Batch>
  <Batch items={batches.tanks}><sphereGeometry args={[1, 14, 10]}/></Batch>
  <Batch items={batches.panels}><boxGeometry /></Batch>
  <Batch items={batches.poles}><cylinderGeometry args={[1, 1, 1, 6]}/></Batch>
  <Batch items={batches.lights} glow><boxGeometry /></Batch>
 </group>
}
// The hub on plot 0: a glass dome, a mast with a slow beacon and a ring of light
export function Hub({ palette: p, animate }) {
  const beacon = useRef(null)
  useFrame(({ clock }) => { if (animate && beacon.current)
    beacon.current.scale.setScalar(.8 + .4 * Math.abs(Math.sin(clock.elapsedTime * 1.5))); })
  return <group position={[0, PLOT_TOP, 0]} scale={HEX / 3.2}>
  <mesh castShadow receiveShadow><cylinderGeometry args={[1.5, 1.7, .35, 24]}/><meshStandardMaterial color={p['hull-shade']} roughness={.6}/></mesh>
  <mesh position={[0, .17, 0]} castShadow><sphereGeometry args={[1.35, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]}/><meshStandardMaterial color={p.glass} transparent opacity={.45} roughness={.1} metalness={.3}/></mesh>
  <mesh position={[0, .5, 0]}><sphereGeometry args={[.45, 16, 12]}/><meshBasicMaterial color={p['edge-pink'].clone().multiplyScalar(1.4)} toneMapped={false}/></mesh>
  <mesh position={[0, 2.3, 0]} castShadow><cylinderGeometry args={[.06, .1, 3.6, 8]}/><meshStandardMaterial color={p.hull}/></mesh>
  <mesh position={[.35, 3.4, 0]} rotation={[0, 0, -.6]} castShadow><cylinderGeometry args={[.55, .08, .25, 16]}/><meshStandardMaterial color={p.hull}/></mesh>
  <mesh ref={beacon} position={[0, 4.15, 0]}><sphereGeometry args={[.13, 10, 8]}/><meshBasicMaterial color={p['edge-pink'].clone().multiplyScalar(2)} toneMapped={false}/></mesh>
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .03, 0]}><ringGeometry args={[2.05, 2.15, 48]}/><meshBasicMaterial color={p['edge-pink']} toneMapped={false}/></mesh>
 </group>
}
export function plotsFor(rings, owners) {
  return spiral(1 + 3 * rings * (rings + 1)).map((cell, index) => ({ key: `home:${index}`, cell, kind: index ? 'plot' : 'hub', tone: toneFor(index || 1), owner: index ? owners[index - 1] : undefined }))
}
// A chain district: the beacon at its centre, then one plot per agent in registry order
export function districtPlots(chain, region, tone, owners) {
  return regionCells(region).map((cell, index) => ({ key: `${chain}:${index}`, cell, kind: index ? 'plot' : 'beacon', tone, owner: index ? owners[index - 1] : undefined }))
}
