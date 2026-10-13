'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, RobotIcon, SignOutIcon, XIcon } from '@phosphor-icons/react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import NativePopover from '@/components/ui/NativePopover'
import ThemeToggle from '@/components/ThemeToggle'
import SignInForm from '@/components/auth/SignInForm'
import { SIGN_IN_EVENT } from '@/lib/signIn'
import { api, errorText } from '@/components/agents/clientApi'
import { site } from '@/config/site'
import styles from './Profile.module.scss'

const copy = site.profile

// Signed out is a 401 from the session route, not a failure worth retrying
export const sessionQuery = {
  queryKey: ['session'],
  queryFn: ({ signal }) => api('session', 'GET', undefined, signal).catch((error) => {
    if (error.status === 401) return null
    throw error
  }),
  retry: false,
}

// Sign-in opens over the page, so it works from anywhere (the colony included)
function SignInDialog({ onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className={styles.profile__dialog} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget)
    onClose(); }}>
    <div className={styles.profile__dialogBody}>
      <Button variant="ghost" size="sm" iconOnly className={styles.profile__dialogClose} aria-label={copy.closeSignIn} icon={<XIcon size={18} />} onClick={onClose} />
      <SignInForm onSignedIn={onClose} />
    </div>
  </dialog>
}
// A new account picks the name others will see before it appears in the colony or chat. The
// placeholder (from the email or wallet) is offered as a starting point, never shown to others.
function PublicNameDialog({ current, onDone }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('profile/name', 'PUT', { name: new FormData(event.currentTarget).get('name') })
      await onDone()
    }
    catch (err) {
      setError(errorText(err))
    }
    finally {
      setBusy(false)
    }
  }
  return <dialog ref={ref} className={styles.profile__dialog} onCancel={(event) => event.preventDefault()}>
    <form className={styles.profile__dialogBody} onSubmit={save}>
      <h2 className={styles.profile__nameTitle}>{copy.nameTitle}</h2>
      <p className={styles.profile__nameText}>{copy.nameText}</p>
      {error && <p role="alert" className={styles.profile__nameError}>{error}</p>}
      <label className={styles.profile__nameField}>{copy.nameLabel}<input name="name" defaultValue={current} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" title={copy.nameHint} autoFocus/></label>
      <Button type="submit" block loading={busy}>{copy.nameSave}</Button>
    </form>
  </dialog>
}
/** The header's account control: the signed-in owner's menu, or Sign in. */
export default function Profile() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session, isPending, isError } = useQuery(sessionQuery)
  const [signingIn, setSigningIn] = useState(false)
  // Other parts of the page (the colony's hero) ask for sign-in through an event
  useEffect(() => {
    const open = () => setSigningIn(true)
    window.addEventListener(SIGN_IN_EVENT, open)
    return () => window.removeEventListener(SIGN_IN_EVENT, open)
  }, [])

  if (isPending) return <span className={styles.profile__placeholder} aria-hidden="true" />
  if (isError || !session)
    return <><Button size="sm" onClick={() => setSigningIn(true)}>{copy.signIn}</Button>{signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}</>

  if (!session.named)
    return <><Avatar src={session.profile?.avatar} name={session.username} size={38} /><PublicNameDialog current={/^(up|wallet)-[0-9a-f]{6}(-\d+)?$/.test(session.username) ? '' : session.username} onDone={() => queryClient.invalidateQueries()} /></>

  const signOut = async (close) => {
    close()
    await api('auth/logout', 'POST').catch(() => { })
    queryClient.resetQueries()
    router.push('/')
    router.refresh()
  }

  return (
    <NativePopover
      placement="bottom-end"
      trigger={
        <button className={styles.profile__trigger} aria-label={copy.open} title={session.username}>
          <Avatar src={session.profile?.avatar} name={session.username} size={38} />
        </button>
      }
    >
      {({ close }) => <div className={styles.profile__body}>
        <div className={styles.profile__identity}>
          <Avatar src={session.profile?.avatar} name={session.username} size={40} />
          <strong>{session.username}</strong>
        </div>
        {site.features.agents && <nav className={styles.profile__links}>
          <Button href={site.agents.path} variant="ghost" block icon={<RobotIcon size={18} />} onClick={close}>{site.agents.title}</Button>
          <Button href={site.createAgent.path} variant="ghost" block icon={<PlusIcon size={18} />} onClick={close}>{site.createAgent.title}</Button>
        </nav>}
        <div className={styles.profile__row}>
          <span>{copy.theme}</span>
          <ThemeToggle />
        </div>
        <Button variant="ghost" block icon={<SignOutIcon size={18} />} onClick={() => signOut(close)}>{copy.signOut}</Button>
      </div>}
    </NativePopover>
  )
}
