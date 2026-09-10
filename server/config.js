import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import logger from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const env = process.env.NODE_ENV || "development";
const isProd = env === "production";

/* ============================================================
   أدوات قراءة البيئة
============================================================ */
const splitList = (v = "") =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const num = (v, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** يحول أي مسار نسبي إلى مطلق نسبةً لجذر المشروع */
const abs = (p, fallback) => {
  const v = String(p || fallback).trim();
  return path.isAbsolute(v) ? v : path.resolve(root, v);
};

const normOrigin = (u) => {
  try {
    return new URL(u).origin;
  } catch {
    return String(u || "").replace(/\/+$/, "");
  }
};

/* ============================================================
   [X3] فحص متغيرات البيئة الحرجة قبل أي شيء آخر
   لا يقلع الخادم في الإنتاج بإعدادات افتراضية أو ناقصة.
============================================================ */
const WEAK_MARKERS = ["change-me", "changeme", "dev-secret", "secret-change", "admin@12345", "password"];

function fail(msg) {
  process.stderr.write(`\nFATAL: ${msg}\n`);
  process.stderr.write("        راجع ملف .env.example لنسخ القيم المطلوبة، ثم أعد التشغيل.\n\n");
  process.exit(1);
}

function assertProductionEnv() {
  if (!isProd) return;
  const required = ["SESSION_SECRET", "CSRF_SECRET", "ALLOWED_ORIGINS", "ADMIN_EMAIL"];
  for (const key of required) {
    const v = process.env[key];
    if (!v || !String(v).trim()) fail(`${key} غير مضبوط — وهو إلزامي في بيئة production`);
  }
  for (const key of ["SESSION_SECRET", "CSRF_SECRET"]) {
    const v = String(process.env[key]);
    if (v.length < 64) fail(`${key} قصير جداً — المطلوب 64 حرفاً عشوائياً على الأقل (الحالي ${v.length})`);
    if (WEAK_MARKERS.some((m) => v.toLowerCase().includes(m))) fail(`${key} يستخدم قيمة افتراضية أو ضعيفة`);
  }
  if (process.env.SESSION_SECRET === process.env.CSRF_SECRET)
    fail("SESSION_SECRET و CSRF_SECRET يجب أن يكونا قيمتين مختلفتين");

  /* [M13] البريد إلزامي في الإنتاج — وإلا تُطبع روابط الاستعادة في السجل */
  const mode = String(process.env.MAIL_MODE || "").toLowerCase();
  if (mode !== "smtp")
    fail(`MAIL_MODE يجب أن يكون smtp في بيئة production (الحالي: ${mode || "غير مضبوط"})`);
  for (const key of ["MAIL_HOST", "MAIL_FROM"]) {
    if (!String(process.env[key] || "").trim()) fail(`${key} مطلوب عندما MAIL_MODE=smtp`);
  }

  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("ADMIN_EMAIL ليس بريداً إلكترونياً صالحاً");
  if (email.endsWith("@nama.local") || email.endsWith("@localhost"))
    fail("ADMIN_EMAIL يستخدم نطاقاً محلياً — ضع بريد المشرف الحقيقي");
}

assertProductionEnv();

/* ============================================================
   [C2] الأصول المسموح لها بالوصول cross-origin
   القاعدة: لا نطاق ثابت في الكود. كل شيء من ALLOWED_ORIGINS.
   - development: يُسمح لـ localhost/127.0.0.1 فقط (وبمنافذ Vite).
   - production: ALLOWED_ORIGINS حصراً، ولا شيء غيره.
   - لا اعتماد على اللاحقات (suffixes) إطلاقاً — الافتراضي فارغ.
============================================================ */
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const configuredOrigins = splitList(process.env.ALLOWED_ORIGINS).map(normOrigin);

const allowedOrigins = [...new Set([
  ...configuredOrigins,
  ...(isProd ? [] : DEV_ORIGINS),
  /* PUBLIC_URL اختياري: إن ضُبط فهو أصل صالح بطبيعته (روابط البريد + الواجهة) */
  ...(process.env.PUBLIC_URL ? [normOrigin(process.env.PUBLIC_URL)] : []),
].filter(Boolean))];

if (isProd && allowedOrigins.length === 0) fail("ALLOWED_ORIGINS لم يُنتج أي أصل صالح");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const port = num(process.env.PORT, 8080, { min: 1, max: 65535 });
const dataDir = abs(process.env.DATA_DIR, "data");
const uploadDir = abs(process.env.UPLOAD_DIR, path.join("data", "uploads"));
const dbPath = abs(process.env.DB_PATH, path.join("data", "mana.db"));

/* ============================================================
   الإعدادات النهائية
============================================================ */
export const config = {
  root,
  version: pkg.version || "2.1.0",
  env,
  isProd,
  host: process.env.HOST || "0.0.0.0",
  port,

  /* عنوان عام يُستخدم في روابط البريد فقط — يُقرأ من البيئة، ولا قيمة ثابتة */
  publicUrl: String(process.env.PUBLIC_URL || "").replace(/\/+$/, ""),

  /* [C2] CORS */
  allowedOrigins,
  /* مُعطّلة عمداً: لا اعتماد على اللاحقات. تُقرأ فقط إن طلبها المشغّل صراحةً */
  originSuffixes: splitList(process.env.CORS_ORIGIN_SUFFIXES || ""),

  /* [C4] الوكيل الموثوق — 0 (false) افتراضياً، ولا يُفعَّل إلا برقم صريح */
  trustProxyHops: num(process.env.TRUST_PROXY_HOPS, 0, { min: 0, max: 10 }),

  /* الأسرار */
  sessionSecret: process.env.SESSION_SECRET || "dev-only-session-secret-not-for-production-use-0000000000",
  csrfSecret: process.env.CSRF_SECRET || "dev-only-csrf-secret-not-for-production-use-0000000000",

  /* الجلسات */
  sessionIdleMinutes: num(process.env.SESSION_IDLE_MINUTES, 30, { min: 1, max: 1440 }),
  sessionMaxMinutes: num(process.env.SESSION_MAX_MINUTES, 720, { min: 5, max: 43200 }),
  maxSessionsPerUser: num(process.env.MAX_SESSIONS_PER_USER, 5, { min: 1, max: 50 }),
  sessionCookieName: "nama_sid",
  csrfCookieName: "nama_csrf",

  /* حماية الدخول */
  loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 5, { min: 2, max: 50 }),
  loginLockMinutes: num(process.env.LOGIN_LOCK_MINUTES, 15, { min: 1, max: 1440 }),
  loginCaptchaAfter: num(process.env.LOGIN_CAPTCHA_AFTER, 3, { min: 1, max: 20 }),
  /* [C5] نافذة تلاشي عدّاد المحاولات الفاشلة — بعده يُصفَّر العدّاد تلقائياً */
  loginFailDecayMinutes: num(process.env.LOGIN_FAIL_DECAY_MINUTES, 30, { min: 5, max: 1440 }),

  /* حدود الرفع */
  maxFileMB: num(process.env.MAX_FILE_MB, 5, { min: 1, max: 100 }),
  maxFilesPerRequest: num(process.env.MAX_FILES_PER_REQUEST, 8, { min: 1, max: 24 }),

  /* حدود المعدل */
  rateLimitGeneral: num(process.env.RATE_LIMIT_GENERAL, 400, { min: 10, max: 100000 }),
  rateLimitAuth: num(process.env.RATE_LIMIT_AUTH, 20, { min: 3, max: 1000 }),
  rateLimitUpload: num(process.env.RATE_LIMIT_UPLOAD, 60, { min: 1, max: 1000 }),
  rateLimitClick: num(process.env.RATE_LIMIT_CLICK, 30, { min: 1, max: 1000 }),

  /* المسارات */
  dataDir,
  uploadDir,
  dbPath,
  distDir: path.join(root, "dist"),

  /* البريد */
  mail: {
    mode: String(process.env.MAIL_MODE || "console").toLowerCase(),
    host: process.env.MAIL_HOST || process.env.SMTP_HOST || "",
    port: num(process.env.MAIL_PORT || process.env.SMTP_PORT, 587, { min: 1, max: 65535 }),
    secure: String(process.env.MAIL_SECURE || process.env.SMTP_SECURE || "false") === "true",
    user: process.env.MAIL_USER || process.env.SMTP_USER || "",
    pass: process.env.MAIL_PASS || process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "منصة نَما <no-reply@localhost>",
  },

  /* الأدمن الأولي — لا كلمة مرور افتراضية في الكود */
  admin: {
    email: String(process.env.ADMIN_EMAIL || "").toLowerCase().trim(),
    name: process.env.ADMIN_NAME || "مدير المنصة",
    password: process.env.ADMIN_PASSWORD || "",
  },
};

/* ============================================================
   إنشاء المجلدات المطلوبة
============================================================ */
export const uploadsDir = config.uploadDir;
export const mediaDir = path.join(uploadsDir, "media");
export const attachmentsDir = path.join(uploadsDir, "attachments");
export const tmpUploadDir = path.join(uploadsDir, "tmp");

for (const d of [config.dataDir, uploadsDir, mediaDir, attachmentsDir, tmpUploadDir]) {
  fs.mkdirSync(d, { recursive: true });
}

export const DATABASE_PATH = config.dbPath;

/** يولّد سراً عشوائياً آمناً — يُستخدم لطباعته في دليل التشغيل */
export function generateSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/* عند التشغيل المباشر: node server/config.js --gen-secret */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--gen-secret")) {
    process.stdout.write(`SESSION_SECRET=${generateSecret()}\nCSRF_SECRET=${generateSecret()}\n`);
  }
}

logger.debug("config loaded", {
  env,
  port,
  allowedOrigins,
  originSuffixes: config.originSuffixes,
  trustProxyHops: config.trustProxyHops,
  dataDir,
  dbPath,
});
