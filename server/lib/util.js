import crypto from "node:crypto";
import { all, one, run, now } from "../db.js";

/* ---------------- أدوات عامة ---------------- */
export const uid = (p = "ID") =>
  `${p}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;

export const token = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");
export const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

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

export const pager = (page = 1, perPage = 12) => ({
  page: Math.max(1, Number(page) || 1),
  per: Math.min(50, Math.max(1, Number(perPage) || 12)),
});

export const paginate = (rows, page, per) => ({
  items: rows,
  total: rows.length,
  page,
  pages: Math.max(1, Math.ceil(rows.length / per)),
  per,
});

/* ---------------- كلمات المرور (scrypt) ---------------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}
export function verifyPassword(password, salt, expected) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(String(expected), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- الجلسات ---------------- */
export function createSession(userId, ip, ua) {
  const raw = token(32);
  const createdAt = now();
  const max = Number(process.env.SESSION_MAX_MINUTES || 720) * 60000;
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
  const nowMs = Date.now();
  if (new Date(s.expires_at).getTime() <= nowMs) {
    run("DELETE FROM sessions WHERE token_hash = ?", s.token_hash);
    return null;
  }
  // الجلسة المطلقة: تنشأ مع expires_at عند الحد الأقصى، ولا نمدد بعدها
  return s;
}

export function touchSession(rawToken) {
  const s = loadSession(rawToken);
  if (!s) return null;
  const idle = Number(process.env.SESSION_IDLE_MINUTES || 30) * 60000;
  const desired = Date.now() + idle;
  const max = new Date(s.expires_at).getTime();
  const next = Math.min(desired, max);
  run("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", new Date(next).toISOString(), s.token_hash);
  return { ...s, expires_at: new Date(next).toISOString() };
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

/* ---------------- مصادر السيرفر ---------------- */
export const unreadCount = (userId) =>
  (one("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", userId) || {}).c || 0;

export const clientOf = (u) => (u.role === "client" ? u : null);
export const adminOf = (u) => (u.role === "admin" ? u : null);

/** رفع كيان داخل سجل من المصفوفات */
export const escapeLike = (v) => String(v || "").replace(/[\\%_]/g, (m) => "\\" + m);
export const like = `%${""}%`;
export const byName = (u) => u?.name || "النظام";

/* ---------------- صياغة الأعداد بالعربية ----------------
   arCount(5, { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة" })
   → "5 دقائق" — تُستخدم في كل الرسائل التي تذكر عدداً لتفادي أخطاء مثل "5 دقيقة". */
export function arCount(n, { one, two, few, many } = {}) {
  const num = Number(n) || 0;
  if (num === 1) return one;
  if (num === 2) return two;
  if (num >= 3 && num <= 10) return `${num} ${few}`;
  return `${num} ${many}`;
}

/** مدة الحظر/الانتظار بصياغة عربية سليمة: "دقيقة واحدة"، "دقيقتان"، "5 دقائق"، "15 دقيقة" */
export const arMinutes = (n) =>
  arCount(n, { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة" });

/** رقم عرض إنساني للطلب/التذكرة بدل المعرف التقني: "طلب رقم 1042" */
export const requestNo = (seq) => `طلب رقم ${seq ?? "—"}`;
export const ticketNo = (seq) => `تذكرة رقم ${seq ?? "—"}`;
