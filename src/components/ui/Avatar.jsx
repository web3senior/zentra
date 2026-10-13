'use client'

import { useState } from 'react'
import clsx from 'clsx'
import styles from './Avatar.module.scss'

/**
 * Avatar
 * The one way a profile picture is rendered, after hupsocial's: the picture when there is one,
 * and the name's first letter when there is none or it fails to load.
 * @param {Object} props
 * @param {string|null} [props.src] Profile image URL.
 * @param {string} props.name Whose avatar; its first letter is the fallback.
 * @param {number} [props.size] Width and height in px.
 * @param {string} [props.className] Avatar class from the consumer's module.
 */
export default function Avatar({ src, name, size = 36, className }) {
  const [failed, setFailed] = useState(null)
  const showImage = src && failed !== src

  return (
    <span className={clsx(styles.avatar, className)} style={{ '--avatar-size': `${size}px` }} aria-hidden="true">
      {showImage
        ? <img src={src} alt="" width={size} height={size} decoding="async" className={styles.avatar__image} onError={() => setFailed(src)} />
        : name.slice(0, 1).toUpperCase()}
    </span>
  )
}
