'use client'

import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'
import { Morph } from 'cube-motion/react'
import Button from '@/components/ui/Button'
import useIsClient from '@/hooks/useIsClient'
import styles from './ThemeToggle.module.scss'

export default function ThemeToggle({ className }) {
  const { resolvedTheme, setTheme } = useTheme()
  // The resolved theme is unknown until the browser reports it
  const isClient = useIsClient()
  const isDark = isClient && resolvedTheme === 'dark'
  const nextTheme = isDark ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      iconOnly
      className={className}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
      icon={
        <Morph
          className={styles.toggle__icon}
          active={isDark}
          off={<MoonIcon size={20} weight="bold" aria-hidden="true" />}
          on={<SunIcon size={20} weight="bold" aria-hidden="true" />}
        />
      }
    />
  )
}
