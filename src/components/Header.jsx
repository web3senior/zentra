import Link from 'next/link'
import Image from 'next/image'
import Profile from '@/components/Profile'
import { site } from '@/config/site'
import styles from './Header.module.scss'

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.header__inner}>
        <Link href="/" className={styles.header__brand} aria-label={`${site.name} ${site.profile.home}`}>
          <Image src={site.fullLogo.src} width={site.fullLogo.width} height={site.fullLogo.height} alt="" className={styles.header__logo} preload />
        </Link>
        <Profile />
      </div>
    </header>
  )
}
