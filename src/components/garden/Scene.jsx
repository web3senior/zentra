'use client'
import { memo, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, Object3D, PCFShadowMap, Vector3 } from 'three'
import { useGardenPalette } from './palette'
import { MoonSurface, Plots, Modules, Hub, plotsFor, districtPlots } from './Objects'
import { Monument } from './Monument'
import { JobBoard } from './JobBoard'
import { MarketStall } from './MarketStall'
import { People, PresenceSync } from './People'
import { PlotMusic } from './Music'
import { Boombox } from './Boombox'
import { GardenAgent } from './Resident'
import { Sky } from './Atmosphere'
import { Navigation } from './Navigation'
import { HEX, colonyRadius, districtRegion, groundFor, hexCenter, overviewFit, ringsFor } from './layout'
import { isChainTone } from './palette'
import { site } from '@/config/site'
function Ready({ onReady }) { useEffect(() => onReady(), [onReady]); return null; }
function Diagnostics() { const frames = useRef(0); useFrame(({ gl, camera, scene, size }) => { const canvas = gl.domElement; canvas.dataset.frames = String(++frames.current); canvas.dataset.camera = camera.position.toArray().map((n) => n.toFixed(3)).join(','); canvas.dataset.look = camera.quaternion.toArray().map((n) => n.toFixed(3)).join(','); const visitor = scene.getObjectByName('visitor'); if (visitor)
  canvas.dataset.avatar = visitor.position.toArray().map((n) => n.toFixed(3)).join(','); if (frames.current % 15 === 1) {
  const targets = {}
  scene.traverse((o) => { if (o.name.startsWith('resident:') || o.name.startsWith('boombox:') || o.name.startsWith('monument:') || o.name.startsWith('jobs:') || o.name.startsWith('person:')) {
    const point = o.localToWorld(new Vector3(0, o.name.startsWith('monument:') || o.name.startsWith('jobs:') ? 4.5 : o.name.startsWith('boombox:') ? .35 : 1, 0)).project(camera)
    targets[o.name] = [(point.x + 1) * size.width / 2, (-point.y + 1) * size.height / 2]
  } })
  canvas.dataset.targets = JSON.stringify(targets)
} }); return null; }
// Offset of the sun from what it lights, and the shadow area round a walking visitor
const SUN = [-30, 40, 18], WALK_SHADOW = 24, SHADOW_MAP = 2048
// The sun. In the overview its shadow covers the whole map; walking, a map that size leaves the
// astronaut a few blurred texels that swim as they move, so the shadow area follows the visitor
// instead, snapped to whole texels so it stays still under them.
function Sun({ palette: p, reach, mode }) {
  const light = useRef(null)
  const target = useMemo(() => new Object3D(), [])
  useEffect(() => {
    const sun = light.current
    if (!sun)
      return
    sun.target = target
    const extent = mode === 'walk' ? WALK_SHADOW : reach
    Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: extent * 2 + 80 })
    sun.shadow.camera.updateProjectionMatrix()
    target.position.set(0, 0, 0)
    sun.position.set(...SUN)
    target.updateMatrixWorld()
  }, [mode, reach, target])
  useFrame(({ scene }) => {
    const sun = light.current, visitor = mode === 'walk' && scene.getObjectByName('visitor')
    if (!sun || !visitor)
      return
    const texel = WALK_SHADOW * 2 / SHADOW_MAP
    const x = Math.round(visitor.position.x / texel) * texel, z = Math.round(visitor.position.z / texel) * texel
    target.position.set(x, 0, z)
    target.updateMatrixWorld()
    sun.position.set(x + SUN[0], SUN[1], z + SUN[2])
  })
  return <><primitive object={target}/><directionalLight ref={light} position={SUN} color={p.sun} intensity={3} castShadow shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]} shadow-normalBias={.02}/></>
}
// Haze and sky. Walking, the haze starts past the colony as always. In the overview the camera
// backs off to fit the whole map, so the haze is measured from it the same way, and the sky dome
// grows to keep the camera inside.
function Atmosphere({ palette: p, reach, focus, mode }) {
  const { size } = useThree()
  const fit = useMemo(() => overviewFit(focus, size.width / size.height), [focus, size.width, size.height])
  const fog = mode === 'map' ? [fit.distance + 25, fit.distance + 120] : [reach + 25, reach + 120]
  return <><fog attach="fog" args={[p.haze, ...fog]}/><Sky palette={p} reach={Math.max(reach, fit.position.length())}/></>
}
// The area the walking visitor stands in, for the chat's "Here" room: a job board's plot, a chain
// district, or the hub. Checked twice a second, reported only when it changes.
function AreaWatch({ world, onArea }) {
  const last = useRef({ at: 0, area: undefined })
  useFrame(({ scene, clock }) => {
    if (!onArea || clock.elapsedTime - last.current.at < .5)
      return
    last.current.at = clock.elapsedTime
    const visitor = scene.getObjectByName('visitor')
    if (!visitor)
      return
    const { x, z } = visitor.position
    const near = (cell, reach) => { const [cx, cz] = hexCenter(cell); return Math.hypot(x - cx, z - cz) < reach; }
    const area = world.boards.some(({ cell }) => near(cell, HEX)) ? 'jobs'
      : world.districts.find(({ region }) => near(region.center, colonyRadius(region.rings) + HEX))?.district.id ?? 'hub'
    if (area !== last.current.area) {
      last.current.area = area
      onArea(area)
    }
  })
  return null
}
function Scene(props) {
  const p = useGardenPalette()
  const rings = ringsFor(props.agents.length)
  const hasMarket = !!props.market
  // Home colony first, then one district per chain; residents stand on their plots in order
  const world = useMemo(() => {
    const home = { center: [0, 0], rings }
    const districts = props.districts.map((district, i) => ({ district, region: districtRegion(rings, i, district.agents.length), tone: (isChainTone(district.id) ? district.id : 'violet') }))
    // Job boards take the home colony's last plots, which ringsFor always leaves free, and the
    // market the plot before them
    const homePlots = plotsFor(rings, props.agents).map((plot, i, all) => i >= all.length - props.boards.length ? { ...plot, kind: 'jobs', tone: 'gold', board: props.boards[all.length - 1 - i] }
      : hasMarket && i === all.length - props.boards.length - 1 ? { ...plot, kind: 'market', tone: 'pink' } : plot)
    // A test DJ bot owns the plot before the market, when that plot is free, and plays music there
    const djIndex = homePlots.length - props.boards.length - 2
    const dj = hasMarket && djIndex > props.agents.length
      ? { id: 'market-dj', name: site.market.dj.name, type: site.market.dj.type, status: site.market.dj.status, currentTask: site.market.dj.task, music: site.market.dj.music }
      : null
    if (dj)
      homePlots[djIndex] = { ...homePlots[djIndex], owner: dj }
    const plots = [...homePlots, ...districts.flatMap(({ district, region, tone }) => districtPlots(district.id, region, tone, district.agents))]
    const residents = [...props.agents.map((agent, i) => ({ agent, cell: plots[i + 1].cell, tone: plots[i + 1].tone, index: i })),
      ...districts.flatMap(({ district }, d) => district.agents.map((agent, i) => { const plot = plots.find((p) => p.key === `${district.id}:${i + 1}`); return { agent, cell: plot.cell, tone: plot.tone, index: i + d * 7 + 3 }; }))]
    const regions = [home, ...districts.map((d) => d.region)]
    const circles = regions.map((r) => { const [x, z] = hexCenter(r.center); return { x, z, radius: colonyRadius(r.rings) }; })
    const reach = Math.max(...circles.map((c) => Math.hypot(c.x, c.z) + c.radius))
    const focus = circles
    const boards = homePlots.filter((plot) => plot.kind === 'jobs')
    const market = homePlots.find((plot) => plot.kind === 'market')
    if (dj)
      residents.push({ agent: dj, cell: homePlots[djIndex].cell, tone: homePlots[djIndex].tone, index: residents.length })
    const music = residents.flatMap(({ agent, cell }) => agent.music ? [{ id: agent.id, cell, url: agent.music }] : [])
    return { plots, residents, districts, boards, market, reach, focus, music, ground: groundFor(regions), start: colonyRadius(rings) - 1.5 }
  }, [rings, props.agents, props.districts, props.boards, hasMarket])
  const reach = world.reach + 4
  return <Canvas camera={{ position: [17, 25, 30], fov: 44, near: .1, far: 1200 }} dpr={[1, 1.5]} shadows={{ type: PCFShadowMap }} frameloop={!props.visible ? 'never' : props.animate ? 'always' : 'demand'} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }} onCreated={({ gl }) => { gl.domElement.setAttribute('aria-label', site.garden.title); gl.domElement.dataset.renderer = 'garden'; }}>
  <color attach="background" args={[p.space]}/>
  <hemisphereLight args={[p.haze, p['regolith-dark'], 1.1]}/>
  <Sun palette={p} reach={reach} mode={props.mode}/>
  <directionalLight position={[25, 10, -20]} color={p.lavender} intensity={.6}/>
  <Atmosphere palette={p} reach={reach} focus={world.focus} mode={props.mode}/><MoonSurface palette={p} reach={world.reach}/>
  <Plots palette={p} plots={world.plots} selected={props.selected}/><Modules palette={p} plots={world.plots}/><Hub palette={p} animate={props.animate}/>
  {world.districts.map(({ district, region, tone }) => <Monument key={district.id} palette={p} region={region} color={p[`edge-${tone}`]} logo={district.logo} label={district.name} animate={props.animate} onOpen={() => props.onOpenDistrict(district.id)}/>)}
  {world.boards.map(({ board, cell }) => <JobBoard key={board.id} board={board} cell={cell} palette={p} animate={props.animate} onOpen={() => props.onOpenBoard(board.id)}/>)}
  {world.market && <MarketStall market={props.market} cell={world.market.cell} palette={p} animate={props.animate} onOpen={props.onOpenMarket}/>}
  <People people={props.people} palette={p} animate={props.animate} onSelect={props.onSelectPerson}/>
  <PresenceSync realtime={props.realtime} sharing={props.shareWalk}/>
  {props.mode === 'walk' && <AreaWatch world={world} onArea={props.onArea}/>}
  {world.residents.map(({ agent, cell, tone, index }) => <GardenAgent key={agent.id} agent={agent} index={index} cell={cell} tone={tone} palette={p} selected={props.selected === agent.id} animate={props.animate} onSelect={props.onSelect}/>)}
  <Navigation mode={props.mode} reset={props.reset} focus={world.focus} ground={world.ground} start={world.start} inputRef={props.inputRef} active={props.visible && !props.blocked} visitor={props.visitor} visitorUp={props.visitorUp} palette={p} animate={props.animate}/>
  {world.residents.filter(({ agent }) => agent.music).map(({ agent, cell, tone }) => <Boombox key={`boombox:${agent.id}`} id={agent.id} cell={cell} tone={tone} palette={p} playing={props.playing === agent.id && !props.mutedPlots.includes(agent.id)} animate={props.animate} onToggle={() => props.onToggleMute(agent.id)}/>)}
  <PlotMusic sources={world.music} active={props.mode === 'walk' && props.visible} mutedIds={props.mutedPlots} onPlaying={props.onPlaying}/>
  <Ready onReady={props.onReady}/>{process.env.NODE_ENV !== 'production' && <Diagnostics />}
 </Canvas>
}
export default memo(Scene)
