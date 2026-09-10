import nodemailer from "nodemailer";
import { config } from "../config.js";
import logger from "./logger.js";

/**
 * إرسال البريد.
 *
 * [M13] في الإنتاج يُرفض الإقلاع أصلاً إن لم يكن MAIL_MODE=smtp (يُفحص في config.js)،
 * لذلك وضع console هنا للتطوير فقط. وحتى في التطوير لا نطبع محتوى الرسالة
 * كاملاً — فقط الوجهة والموضوع — لأن رسائل الاستعادة تحتوي توكنات صالحة.
 */
let transporter = null;

if (config.mail.mode === "smtp") {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @returns {Promise<{mode:string}>}
 */
export async function sendMail(to, subject, html) {
  if (config.mail.mode !== "smtp" || !transporter) {
    /* لا نطبع نص الرسالة: روابط الاستعادة تحتوي توكنات صالحة ساعة كاملة */
    logger.warn("mail not configured — message dropped", { to, subject });
    return { mode: "console" };
  }
  await transporter.sendMail({ from: config.mail.from, to, subject, html });
  logger.info("mail sent", { to, subject });
  return { mode: "smtp" };
}

/** يتحقق من صحة إعداد SMTP عند الإقلاع (لا يفشل التشغيل عند التعذر) */
export async function verifyMailer() {
  if (!transporter) return { ok: false, reason: "MAIL_MODE is not smtp" };
  try {
    await transporter.verify();
    logger.info("smtp transport verified", { host: config.mail.host, port: config.mail.port });
    return { ok: true };
  } catch (e) {
    logger.error("smtp transport verification failed", { message: e.message });
    return { ok: false, reason: e.message };
  }
}

/** يبني رسالة HTML بسيطة بتنسيق عربي */
export function mailTemplate(title, lines, cta) {
  const body = lines.map((l) => `<p style="margin:0 0 .9em;line-height:1.9">${l}</p>`).join("");
  const button = cta
    ? `<p style="margin:1.4em 0"><a href="${cta.url}" style="background:#0d7a5f;color:#fff;padding:.7em 1.4em;border-radius:8px;text-decoration:none;display:inline-block">${cta.label}</a></p>`
    : "";
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:0 auto;padding:1.5rem;color:#16221f">
  <h2 style="margin:0 0 1rem;color:#0d7a5f">${title}</h2>
  ${body}${button}
  <hr style="border:none;border-top:1px solid #e3eae7;margin:1.5rem 0"/>
  <p style="font-size:.85rem;color:#7c8b86;margin:0">إن لم تطلب هذا الإجراء يمكنك تجاهل هذه الرسالة بأمان.</p>
</div>`;
}
