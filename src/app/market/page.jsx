import MarketGrid from '@/components/market/MarketGrid'
import { site } from '@/config/site'
import styles from './page.module.scss'

const copy = site.market

export const metadata = { title: copy.title, description: copy.description }

export default function MarketPage() {
  return (
    <main className={styles.page}>
      <header className={styles.page__intro}>
        <span className={styles.page__eyebrow}>{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.description}</p>
      </header>
      <MarketGrid />
    </main>
  )
}
