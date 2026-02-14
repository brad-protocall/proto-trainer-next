/**
 * Lightweight notification utility for session flags.
 *
 * Uses nodemailer when SMTP is configured, otherwise logs a reminder.
 * All functions are fire-and-forget — they never throw or block the caller.
 *
 * Required env vars for email:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL_TO
 *
 * Optional:
 *   NOTIFICATION_EMAIL_FROM (defaults to SMTP_USER)
 */

import nodemailer from 'nodemailer'

interface FlagNotification {
  flagId: string
  type: string
  severity: string
  details: string
  sessionId: string
  learnerName: string
}

// Lazy-init transporter (only created once, only if SMTP is configured)
let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return transporter
}

export async function notifyFlag(flag: FlagNotification): Promise<void> {
  const to = process.env.NOTIFICATION_EMAIL_TO
  const mailer = getTransporter()

  if (!mailer || !to) {
    console.log('📧 Email notification skipped (SMTP not configured). Set SMTP_HOST, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL_TO to enable.')
    return
  }

  const severityEmoji = flag.severity === 'critical' ? '🔴' : flag.severity === 'warning' ? '🟡' : 'ℹ️'
  const subject = `${severityEmoji} Session Flag: ${flag.type.replace(/_/g, ' ')} (${flag.severity})`

  const text = [
    `Session Flag Created`,
    ``,
    `Type: ${flag.type}`,
    `Severity: ${flag.severity}`,
    `Learner: ${flag.learnerName}`,
    `Session ID: ${flag.sessionId}`,
    ``,
    `Details:`,
    flag.details,
    ``,
    `---`,
    `Review in supervisor dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'}/supervisor`,
  ].join('\n')

  const from = process.env.NOTIFICATION_EMAIL_FROM || process.env.SMTP_USER

  await mailer.sendMail({ from, to, subject, text })
  console.log(`📧 Flag notification sent to ${to}`)
}
