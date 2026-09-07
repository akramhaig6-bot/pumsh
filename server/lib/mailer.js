import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter = null;
if (config.mail.mode === "smtp") {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
}

/** إرسال بريد؛ إذا لم يُهيأ SMTP يُسجَّل الرابط في سجل الخادم (وضع تطوير) */
export async function sendMail(to, subject, html) {
  if (config.mail.mode !== "smtp" || !transporter) {
    console.log("[mail:dev] to=%s subject=%s\n%s", to, subject, html);
    return { mode: "dev" };
  }
  await transporter.sendMail({ from: config.mail.from, to, subject, html });
  return { mode: "smtp" };
}
