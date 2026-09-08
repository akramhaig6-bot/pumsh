import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const splitList = (v = "") => v.split(",").map((s) => s.trim()).filter(Boolean);
const normOrigin = (u) => {
  try { return new URL(u).origin; } catch { return (u || "").replace(/\/+$/, ""); }
};

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

export const config = {
  root,
  version: pkg.version || "2.0.0",
  port: Number(process.env.PORT || 8080),
  env: process.env.NODE_ENV || "development",
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, ""),
  /* نطاقات الواجهة الأمامية المسموح لها cross-origin:
     CORS_ORIGINS (قائمة) + PUBLIC_URL — تُستخدم لـ CORS واختيار سياسة الكوكيز.
     عند عدم ضبط أي نطاق مختلف: يبقى السلوك same-origin كما كان تماماً. */
  frontendOrigins: [...new Set([
    ...splitList(process.env.CORS_ORIGINS).map(normOrigin),
    normOrigin(process.env.PUBLIC_URL || ""),
  ].filter(Boolean))],
  /* لاحقات يُسمح لأي أصل ينتهي بها (مثل معاينات *.vercel.app) */
  originSuffixes: splitList(process.env.CORS_ORIGIN_SUFFIXES || ".vercel.app"),
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
