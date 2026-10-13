import { forwardRef } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Spinner } from '@/components/Loading'
import styles from './Button.module.scss'

/**
 * The one button. Renders a link when given `href` (a page of the site through Next's Link, an
 * external one in a new tab), a <button> otherwise.
 * @param {'primary'|'secondary'|'ghost'|'link'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.block] Full width.
 * @param {boolean} [props.loading] Swaps the icon for a spinner and disables the button.
 * @param {React.ReactNode} [props.icon] Leading icon.
 * @param {boolean} [props.iconOnly] Square button; `aria-label` becomes required.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    icon,
    iconOnly = false,
    href,
    external,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  const classes = clsx(
    styles.button,
    styles[`button--${variant}`],
    styles[`button--${size}`],
    block && styles['button--block'],
    iconOnly && styles['button--icon-only'],
    className
  )

  const content = (
    <>
      {loading ? <Spinner size={16} color="currentColor" /> : icon}
      {!iconOnly && children && <span className={styles.button__label}>{children}</span>}
    </>
  )

  if (href) {
    const isExternal = external ?? /^https?:\/\//.test(href)
    if (!isExternal) {
      return (
        <Link ref={ref} href={href} className={classes} {...rest}>
          {content}
        </Link>
      )
    }
    return (
      <a
        ref={ref}
        href={href}
        className={classes}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
        {content}
      </a>
    )
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  )
})

export default Button
