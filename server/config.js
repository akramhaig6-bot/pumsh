import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export const config = {
  root,
  port: Number(process.env.PORT || 8080),
  env: process.env.NODE_ENV || "development",
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, ""),
  secret: process.env.SECRET || "dev-secret-change-me",
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES || 30),
  sessionMaxMinutes: Number(process.env.SESSION_MAX_MINUTES || 720),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  loginCaptchaAfter: Number(process.env.LOGIN_CAPTCHA_AFTER || 3),
  maxFileMB: Number(process.env.MAX_FILE_MB || 5),
  dataDir: process.env.DATA_DIR || path.join(root, "data"),
  mail: {
    mode: process.env.MAIL_MODE || "none",
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "منصة نَما <no-reply@localhost>",
  },
};

// إنشاء مجلدات البيانات
export const uploadsDir = path.join(config.dataDir, "uploads");
export const mediaDir = path.join(uploadsDir, "media");
export const attachmentsDir = path.join(uploadsDir, "attachments");
for (const d of [config.dataDir, mediaDir, attachmentsDir]) {
  fs.mkdirSync(d, { recursive: true });
}

export const distDir = path.join(root, "dist");
export const DATABASE_PATH = path.join(config.dataDir, "mana.db");
