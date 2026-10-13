import clsx from 'clsx'
import { BouncingDots, Ring } from 'loading-dev'
import styles from './Loading.module.scss'

// Swap for any other loading-dev export to restyle every spinner in the app
const Indicator = Ring

const DEFAULT_COLOR = 'var(--color-accent-line)'

// Call sites may pass CSS lengths; loading-dev takes pixels
const toPixels = (size, fallback) => {
  const parsed = typeof size === 'number' ? size : Number.parseFloat(size)
  return Number.isFinite(parsed) ? parsed : fallback
}

// loading-dev marks its svg aria-hidden, so the accessible label lives on the wrapper.
// label={null} makes it decorative, beside text that already says what is loading
export const Spinner = ({ size = 20, color = DEFAULT_COLOR, className, label = 'Loading', ...rest }) => (
  <span
    className={clsx(styles.spinner, className)}
    role={label ? 'status' : undefined}
    aria-label={label || undefined}
    aria-hidden={label ? undefined : true}
  >
    <Indicator {...rest} color={color} size={toPixels(size, 20)} />
  </span>
)

export const ContentSpinner = ({ size = 24, color, className, label = 'Content loading' }) => (
  <div className={clsx(styles['content-spinner'], className)} aria-busy="true">
    <Spinner color={color} label={label} size={size} />
  </div>
)

// Someone is writing. Decorative beside a label of its own, so it carries none
export const TypingDots = ({ size = 28, color = 'currentColor', className }) => (
  <span className={clsx(styles.spinner, className)} aria-hidden="true">
    <BouncingDots color={color} size={toPixels(size, 28)} />
  </span>
)

export default Spinner
