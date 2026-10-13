import nodemailer from 'nodemailer'
import { site } from '@/config/site'
import { AppError } from './store'
// Sign-in codes by SMTP, after hupsocial's mailer: any provider works (Gmail app password, Resend,
// Brevo) through ZENTRA_SMTP_HOST, _PORT, _USER, _PASS and _FROM, or hupsocial's SMTP_* names. Without
// a host, development logs the code to the server console instead; production refuses rather than
// pretend it sent.
const smtp = (name) => process.env[`ZENTRA_SMTP_${name}`] || process.env[`SMTP_${name}`]
const copy = site.email
// RFC 2606 reserved domains never receive mail: log their codes rather than bounce
const reserved = /@(example\.(com|net|org)|[^@]+\.(test|invalid|localhost))$/i
let cached
function transport() {
  const port = Number(smtp('PORT') || 465)
  const fingerprint = [smtp('HOST'), port, smtp('USER'), smtp('PASS')].join(' ')
  // Keyed on the settings: the dev server reloads .env in place
  if (cached?.fingerprint !== fingerprint)
    cached = { fingerprint, transport: nodemailer.createTransport({ host: smtp('HOST'), port, secure: port === 465, auth: { user: smtp('USER'), pass: smtp('PASS') } }) }
  return cached.transport
}
export async function sendSignInCode(to, code) {
  if (!smtp('HOST') || reserved.test(to)) {
    if (!smtp('HOST') && process.env.NODE_ENV === 'production')
      throw new AppError(503, 'emailSetup')
    console.log(`[zentra] sign-in code for ${to}: ${code}`)
    return
  }
  try {
    await transport().sendMail({
      from: smtp('FROM') || smtp('USER'), to,
      subject: copy.subject(code), text: copy.text(code),
      html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px"><h2>${copy.heading}</h2><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p>${copy.expiry}</p></div>`,
    })
  }
  catch {
    throw new AppError(502, 'emailFailed')
  }
}
