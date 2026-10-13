import { PerspectiveCamera, Vector3 } from 'three'
// Plot circumradius. Plots are roomy on purpose: modules cluster round the resident and the rest
// stays free for objects owners will place later.
export const HEX = 9
export const PLOT_TOP = .16
export const GROUND = .025
// How far from its centre a plot's raised floor reaches: standing within it is standing on the plot
export const PLOT_REACH = HEX * .8
const SQ3 = Math.sqrt(3)
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
export const hexCenter = ([q, r]) => [HEX * SQ3 * (q + r / 2), HEX * 1.5 * r]
export function spiral(count) {
  const cells = [[0, 0]]
  for (let k = 1; cells.length < count; k++) {
    let cell = [DIRECTIONS[4][0] * k, DIRECTIONS[4][1] * k]
    for (let side = 0; side < 6; side++)
      for (let step = 0; step < k; step++) {
        cells.push(cell)
        cell = [cell[0] + DIRECTIONS[side][0], cell[1] + DIRECTIONS[side][1]]
      }
  }
  return cells.slice(0, count)
}
// Complete rings holding the hub, every agent and at least three free plots (never fewer than two rings)
export const ringsFor = (agents) => { let k = 2; while (1 + 3 * k * (k + 1) < agents + 4)
  k++; return k; }
export const plotCount = (rings) => 1 + 3 * rings * (rings + 1)
export const colonyRadius = (rings) => (rings + 1.15) * HEX * SQ3
function round([q, r]) {
  const s = -q - r
  let rq = Math.round(q), rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s)
  if (dq > dr && dq > ds)
    rq = -rr - rs
  else if (dr > ds)
    rr = -rq - rs
  return [rq, rr]
}
export const random = (seed) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
export const cellKey = ([q, r]) => `${q},${r}`
export const districtRings = (agents) => { let k = 1; while (1 + 3 * k * (k + 1) < agents + 1)
  k++; return k; }
export function districtRegion(home, index, agents) {
  const rings = districtRings(agents)
  const [dq, dr] = DIRECTIONS[(index * 2) % 6]
  const steps = home + rings + 2
  return { center: [dq * steps, dr * steps], rings }
}
export const regionCells = ({ center, rings }) => spiral(plotCount(rings)).map(([q, r]) => [q + center[0], r + center[1]])
// Walking height: plots are low platforms; undefined (beyond the flat ground) stops movement
export function groundFor(regions) {
  const cells = new Set(regions.flatMap(regionCells).map(cellKey))
  // The whole flat ground is walkable; the dunes beyond it (MoonSurface starts them at the same
  // reach) stop movement. Circles per region left invisible walls between colony and districts.
  const reach = regionsReach(regions)
  return (x, z) => {
    if (Math.hypot(x, z) > reach)
      return undefined
    const cell = round([(SQ3 / 3 * x - z / 3) / HEX, (2 / 3 * z) / HEX])
    const [px, pz] = hexCenter(cell)
    return cells.has(cellKey(cell)) && Math.hypot(x - px, z - pz) < PLOT_REACH ? PLOT_TOP : GROUND
  }
}
export const regionsReach = (regions) => Math.max(...regions.map((region) => Math.hypot(...hexCenter(region.center)) + colonyRadius(region.rings)))
// The overview: the camera keeps its usual angle and backs away from the regions' centre only as
// far as this screen shape needs to show every region whole (a ring of points round each, inside
// a margin clear of the overlays). The map fov keeps the screen's shorter side at 44°.
const VIEW = new Vector3(17, 25, 30).normalize()
export const overviewFov = (aspect) => 2 * Math.atan(Math.tan(22 * Math.PI / 180) / Math.min(1, aspect)) * 180 / Math.PI
export function overviewFit(circles, aspect) {
  const minX = Math.min(...circles.map((c) => c.x - c.radius)), maxX = Math.max(...circles.map((c) => c.x + c.radius))
  const minZ = Math.min(...circles.map((c) => c.z - c.radius)), maxZ = Math.max(...circles.map((c) => c.z + c.radius))
  const target = new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2)
  const points = circles.flatMap((c) => Array.from({ length: 24 }, (_, i) => new Vector3(c.x + Math.cos(i * Math.PI / 12) * c.radius, 0, c.z + Math.sin(i * Math.PI / 12) * c.radius)))
  const camera = new PerspectiveCamera(overviewFov(aspect), aspect, .1, 5000)
  const fits = (distance) => {
    camera.position.copy(target).addScaledVector(VIEW, distance)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    return points.every((point) => { const p = point.clone().project(camera); return Math.abs(p.x) < .9 && p.y > -.72 && p.y < .82 && p.z < 1; })
  }
  let low = 5, high = 2000
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2
    if (fits(mid))
      high = mid
    else
      low = mid
  }
  return { x: target.x, z: target.z, distance: high, position: target.clone().addScaledVector(VIEW, high) }
}
