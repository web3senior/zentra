import { useEffect, useMemo } from 'react'
import { BackSide, BufferGeometry, Color, Float32BufferAttribute, SphereGeometry } from 'three'
import { random } from './layout'
// Mars at dusk: a sky dome from dark overhead to dusty haze at the horizon (the same haze the
// fog uses, so the far dunes melt into it), faint stars, Phobos, Deimos and the Earth as a blue star.
// The dome grows with the colony so the dunes stay inside it; moons and stars scale with it.
export function Sky({ palette: p, reach }) {
  const radius = Math.max(260, reach + 200), k = radius / 260
  const dome = useMemo(() => {
    const g = new SphereGeometry(radius, 48, 24)
    const position = g.attributes.position
    const colors = []
    const c = new Color()
    for (let i = 0; i < position.count; i++) {
      const h = Math.max(0, position.getY(i) / radius)
      c.copy(p.haze).lerp(p.space, Math.min(1, Math.pow(h * 2.2, .7)))
      colors.push(c.r, c.g, c.b)
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return g
  }, [p, radius])
  useEffect(() => () => dome.dispose(), [dome])
  const stars = useMemo(() => { const v = []; for (let i = 0; i < 500; i++) {
    const a = random(i) * Math.PI * 2, h = .35 + random(i + .3) * .65, r = 230 * k
    v.push(Math.cos(a) * r * Math.sqrt(1 - h * h), h * r, Math.sin(a) * r * Math.sqrt(1 - h * h))
  } const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(v, 3)); return g; }, [k])
  useEffect(() => () => stars.dispose(), [stars])
  return <group>
  <mesh geometry={dome}><meshBasicMaterial vertexColors side={BackSide} fog={false} depthWrite={false}/></mesh>
  <points geometry={stars}><pointsMaterial color={p.hull} size={1.3} sizeAttenuation={false} fog={false} transparent opacity={.5}/></points>
  <group scale={k}>
  <mesh position={[-60, 70, -160]} scale={[4.2, 3.2, 3.6]} rotation={[.4, .2, .8]}><dodecahedronGeometry args={[1, 1]}/><meshStandardMaterial color={p.moonrock} roughness={1} fog={false} flatShading/></mesh>
  <mesh position={[95, 52, -170]} scale={[1.8, 1.4, 1.6]}><dodecahedronGeometry args={[1, 1]}/><meshStandardMaterial color={p.moonrock} roughness={1} fog={false} flatShading/></mesh>
  <mesh position={[30, 95, -200]}><sphereGeometry args={[.9, 12, 8]}/><meshBasicMaterial color={p.earth.clone().multiplyScalar(1.8)} toneMapped={false} fog={false}/></mesh>
  </group>
 </group>
}
