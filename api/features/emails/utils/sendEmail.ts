// features/emails/utils/sendEmail.ts
import { SendEmailArgs } from "@/features/emails/types";
import "dotenv/config";
import nodemailer from "nodemailer";

const host = process.env.EMAIL_HOST;
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASSWORD;
const from = process.env.EMAIL_FROM;

const transporter = nodemailer.createTransport({
  host,
  port: Number(process.env.EMAIL_PORT ?? "587"),
  secure: false,
  auth: { user, pass },
});

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments = [],
}: SendEmailArgs) {
  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments,
  });
}
