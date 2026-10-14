'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import { api, errorText, RequestError } from '@/components/agents/clientApi'
import { site } from '@/config/site'
import WalletSignIn from './WalletSignIn'
import styles from './SignInForm.module.scss'
const copy = site.agents
// Sign-in, after hupsocial's: an email and a 6-digit code, the account made on first use. Username
// and password stays for accounts made before email sign-in. onSignedIn runs once the session cookie
// is set; the header's session query is refreshed here.
// A wallet's own failure, with the wallet's short reason when it gives one (viem/wagmi's shortMessage)
function walletFailure(error) {
  console.error('[wallet sign-in]', error)
  const reason = typeof error?.shortMessage === 'string' ? error.shortMessage.slice(0, 160) : ''
  return reason ? `${copy.walletFailed} (${reason})` : copy.walletFailed
}
export default function SignInForm({ onSignedIn }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState('email')
  const [register, setRegister] = useState(false)
  const [codeFor, setCodeFor] = useState('')
  const [needInvite, setNeedInvite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function run(work) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
    }
    catch (err) {
      // A new address on an invite-only server: ask for the invite, keep the same code
      if (err instanceof RequestError && err.code === 'invite')
        setNeedInvite(true)
      setError(errorText(err))
    }
    finally {
      setBusy(false)
    }
  }
  const submit = (event) => {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget))
    run(async () => {
      if (method === 'email' && !codeFor) {
        await api('auth/email/request', 'POST', { email: form.email })
        setCodeFor(form.email)
        return
      }
      if (method === 'email')
        await api('auth/email/verify', 'POST', { email: codeFor, code: form.code, ...(form.invite ? { invite: form.invite } : {}) })
      else
        await api(`auth/${register ? 'register' : 'login'}`, 'POST', form)
      await queryClient.invalidateQueries({ queryKey: ['session'] })
      onSignedIn?.()
    })
  }
  const resend = () => run(async () => {
    await api('auth/email/request', 'POST', { email: codeFor })
    setNotice(copy.codeResent)
  })
  const reset = (next) => {
    setMethod(next)
    setCodeFor('')
    setNeedInvite(false)
    setRegister(false)
    setError('')
    setNotice('')
  }
  const flash = <>{error && <p role="alert" className={styles.signin__error}>{error}</p>}{notice && <p role="status" className={styles.signin__notice}>{notice}</p>}</>
  if (method === 'password')
    return <form className={styles.signin} onSubmit={submit}>
   <h2>{register ? copy.signup : copy.signin}</h2><p>{copy.authHint}</p>{flash}
   <label>{copy.username}<input name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" title={copy.usernameHint}/></label>
   <label>{copy.password}<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} placeholder={copy.passwordHint}/></label>
   {register && <label>{copy.invite}<input name="invite" type="password" autoComplete="off" maxLength={256}/></label>}
   <Button type="submit" block loading={busy}>{register ? copy.registerButton : copy.loginButton}</Button>
   <Button variant="ghost" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? copy.toLogin : copy.toRegister}</Button>
   <button type="button" className={styles.signin__switch} disabled={busy} onClick={() => reset('email')}>{copy.useEmail}</button>
  </form>
  return <form key={codeFor ? 'code' : 'email'} className={styles.signin} onSubmit={submit}>
  <h2>{copy.signin}</h2><p>{codeFor ? copy.codeSent(codeFor) : copy.emailHint}</p>{flash}
  {codeFor ? <label>{copy.code}<input name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} autoFocus/></label>
      : <label>{copy.email}<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder={copy.emailPlaceholder} autoFocus/></label>}
  {codeFor && needInvite && <label>{copy.invite}<input name="invite" type="password" autoComplete="off" maxLength={256}/></label>}
  <Button type="submit" block loading={busy}>{codeFor ? copy.verifyCode : copy.sendCode}</Button>
  {codeFor && <div className={styles.signin__actions}><Button variant="secondary" size="sm" disabled={busy} onClick={resend}>{copy.resendCode}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => reset('email')}>{copy.changeEmail}</Button></div>}
  {!codeFor && <WalletSignIn busy={busy} onBusy={setBusy} onError={(err) => setError(!err ? '' : err instanceof RequestError ? errorText(err) : walletFailure(err))} onDone={async () => { await queryClient.invalidateQueries({ queryKey: ['session'] }); onSignedIn?.(); }}/>}
  <button type="button" className={styles.signin__switch} disabled={busy} onClick={() => reset('password')}>{copy.usePassword}</button>
 </form>
}
