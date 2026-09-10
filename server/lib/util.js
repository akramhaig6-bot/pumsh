import crypto from "node:crypto";
import { all, one, run, now } from "../db.js";

/* ============================================================
   أدوات عامة
============================================================ */
export const uid = (p = "ID") =>
  `${p}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;

export const token = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");
export const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

export const slugify = (v = "") =>
  String(v)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const jsonParse = (v, fallback = null) => {
  try {
    return JSON.parse(v ?? "");
  } catch {
    return fallback;
  }
};
export const jsonStr = (v) => JSON.stringify(v ?? null);

/** ترقيم صفحات — الحدود تُفرض خادمياً دائماً */
export const pager = (page = 1, perPage = 12) => ({
  page: Math.max(1, Math.min(100000, Number(page) || 1)),
  per: Math.min(50, Math.max(1, Number(perPage) || 12)),
});

/** شكل موحّد لكتلة الترقيم */
export const pagination = (page, per, total) => ({
  page,
  per,
  total,
  pages: Math.max(1, Math.ceil(total / per)),
});

/** يهرّب محارف LIKE الخاصة — يُستخدم مع ESCAPE '\\' */
export const escapeLike = (v) => String(v || "").replace(/[\\%_]/g, (m) => `\\${m}`);

export const byName = (u) => u?.name || "النظام";

/* ============================================================
   [M17] كلمات المرور — scrypt غير متزامن

   scryptSync كان يحجب حلقة الأحداث ~80-100ms لكل محاولة دخول،
   فتتسلسل كل طلبات الدخول تحت الحمل. الآن العمل يحدث في libuv threadpool.

   البارامترات محفوظة داخل نص الهاش بصيغة:
     scrypt$N$r$p$salt$hash
   حتى يمكن ترقيتها لاحقاً دون كسر الهاشات القديمة.
============================================================ */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, keylen, { N, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => {
      if (err) return reject(err);
      resolve(key);
    });
  });
}

/** يولّد salt + hash بصيغة ذاتية الوصف */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, SCRYPT);
  const hash = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString("hex")}`;
  /* نعيد أيضاً الشكل القديم (salt + hash خام) لأن الجدول يخزنهما في عمودين */
  return { salt, hash: key.toString("hex"), encoded: hash };
}

/**
 * يتحقق من كلمة المرور.
 * يدعم الشكل الجديد (scrypt$N$r$p$salt$hash) والشكل القديم (عمودا salt + hash)
 * حتى لا تنكسر الحسابات الموجودة بعد الترقية.
 */
export async function verifyPassword(password, salt, expected) {
  const exp = String(expected || "");

  /* الشكل الجديد: كل البارامترات داخل النص */
  if (exp.startsWith("scrypt$")) {
    const parts = exp.split("$");
    if (parts.length !== 6) return false;
    const [, N, r, p, s, h] = parts;
    const params = { N: Number(N), r: Number(r), p: Number(p), keylen: Buffer.from(h, "hex").length };
    if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) return false;
    const key = await scryptAsync(password, s, params);
    return timingEqualHex(key.toString("hex"), h);
  }

  /* الشكل القديم: salt منفصل + hash خام بطول 64 بايت */
  const key = await scryptAsync(password, String(salt || ""), SCRYPT);
  return timingEqualHex(key.toString("hex"), exp);
}

function timingEqualHex(a, b) {
  const ba = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ============================================================
   الجلسات
============================================================ */
const sessionMaxMs = () => {
  const mins = Number(process.env.SESSION_MAX_MINUTES || 720);
  return (Number.isFinite(mins) && mins > 0 ? mins : 720) * 60_000;
};
const sessionIdleMs = () => {
  const mins = Number(process.env.SESSION_IDLE_MINUTES || 30);
  return (Number.isFinite(mins) && mins > 0 ? mins : 30) * 60_000;
};

export function createSession(userId, ip, ua) {
  const raw = token(32);
  const createdAt = now();
  const max = sessionMaxMs();
  run(
    `INSERT INTO sessions (token_hash,user_id,created_at,expires_at,ip,ua)
     VALUES (?,?,?,?,?,?)`,
    sha256(raw),
    userId,
    createdAt,
    new Date(Date.now() + max).toISOString(),
    ip || "",
    (ua || "").slice(0, 300),
  );
  return raw;
}

export function loadSession(rawToken) {
  if (!rawToken) return null;
  const s = one("SELECT * FROM sessions WHERE token_hash = ?", sha256(rawToken));
  if (!s) return null;
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    run("DELETE FROM sessions WHERE token_hash = ?", s.token_hash);
    return null;
  }
  return s;
}

/** يمدد الجلسة حتى حد الخمول، دون تجاوز المدة المطلقة */
export function touchSession(rawToken) {
  const s = loadSession(rawToken);
  if (!s) return null;
  const desired = Date.now() + sessionIdleMs();
  const max = new Date(s.expires_at).getTime();
  const next = new Date(Math.min(desired, max)).toISOString();
  if (next !== s.expires_at) {
    run("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", next, s.token_hash);
  }
  return { ...s, expires_at: next };
}

export function revokeSession(rawToken) {
  if (rawToken) run("DELETE FROM sessions WHERE token_hash = ?", sha256(rawToken));
}

export function revokeAllSessions(userId, exceptToken = null) {
  if (exceptToken) {
    run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", userId, sha256(exceptToken));
  } else {
    run("DELETE FROM sessions WHERE user_id = ?", userId);
  }
}

export function getSessionUser(rawToken) {
  const s = loadSession(rawToken);
  if (!s) return null;
  const u = one("SELECT * FROM users WHERE id = ?", s.user_id);
  if (!u) return null;
  return u;
}

/** حقول المستخدم الآمنة للإرسال — لا pass_hash ولا salt ولا failed أبداً */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    role: u.role,
    active: u.active,
    must_change: u.must_change,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

/* ============================================================
   مصادر السيرفر
============================================================ */
export const unreadCount = (userId) =>
  Number(one("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", userId)?.c || 0);

/* ============================================================
   صياغة الأعداد بالعربية
   arCount(5, { one:"دقيقة واحدة", two:"دقيقتان", few:"دقائق", many:"دقيقة" })
============================================================ */
export function arCount(n, { one: o, two, few, many } = {}) {
  const num = Number(n) || 0;
  if (num === 1) return o;
  if (num === 2) return two;
  if (num >= 3 && num <= 10) return `${num} ${few}`;
  return `${num} ${many}`;
}

export const arMinutes = (n) =>
  arCount(n, { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة" });

export const requestNo = (seq) => `طلب رقم ${seq ?? "—"}`;
export const ticketNo = (seq) => `تذكرة رقم ${seq ?? "—"}`;

/* إعادة تصدير مسهّلة — تُستخدم في المسارات */
export { all, one, run, now };
