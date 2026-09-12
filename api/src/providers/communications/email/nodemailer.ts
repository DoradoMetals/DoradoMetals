import nodemailer from 'nodemailer'
import type { Message, Transport } from '#providers/communications/email/types.ts'

export function transport(): Transport {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  })

  return {
    sendMail: ({ tags: _tags, ...message }: Message) =>
      transporter.sendMail({
        ...message,
        to: message.to ?? undefined,
        attachments: message.attachments as nodemailer.SendMailOptions['attachments'],
      }),
  }
}
