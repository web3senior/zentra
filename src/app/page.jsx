import GardenHome from '@/components/garden/GardenHome'
import { site } from '@/config/site'

export const metadata = { description: site.garden.description }

export default function Home() {
  return <GardenHome />
}
