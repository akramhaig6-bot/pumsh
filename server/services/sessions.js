import { db, all, one, run } from "../db.js";
import { config } from "../config.js";
import logger from "../lib/logger.js";

/**
 * [M16] إدارة دورة حياة الجلسات.
 *
 *  1) تنظيف دوري للجلسات المنتهية (كانت تبقى في الجدول للأبد).
 *  2) سقف للجلسات المتزامنة لكل مستخدم — عند التجاوز تُحذف الأقدم.
 *
 * يُستدعى التنظيف من server/index.js عبر setInterval (كل ساعة).
 */

/** حذف الجلسات المنتهية */
export function purgeExpiredSessions() {
  const r = run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  const removed = Number(r.changes || 0);
  if (removed) logger.info("purged expired sessions", { removed });
  return removed;
}

/** حذف جلسات إعادة التعيين المنتهية أو المستهلكة */
export function purgeExpiredResetTokens() {
  const r = run(
    "DELETE FROM reset_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND created_at < ?)",
    new Date().toISOString(),
    new Date(Date.now() - 24 * 3600_000).toISOString(),
  );
  const removed = Number(r.changes || 0);
  if (removed) logger.debug("purged expired reset tokens", { removed });
  return removed;
}

/**
 * يفرض سقف الجلسات المتزامنة للمستخدم.
 * يُستدعى بعد كل إنشاء جلسة ناجحة. الجلسة الحالية مستثناة من الحذف.
 */
export function enforceSessionCap(userId, currentTokenHash) {
  const cap = config.maxSessionsPerUser;
  const rows = all(
    "SELECT token_hash, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
    userId,
  );
  if (rows.length <= cap) return 0;

  const doomed = rows
    .filter((r) => r.token_hash !== currentTokenHash)
    .slice(cap - 1)
    .map((r) => r.token_hash);

  if (!doomed.length) return 0;

  const stmt = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  for (const h of doomed) stmt.run(h);
  logger.info("enforced session cap", { userId, cap, removed: doomed.length });
  return doomed.length;
}

/** عدد الجلسات النشطة لمستخدم */
export function countSessions(userId) {
  return Number(one("SELECT COUNT(*) c FROM sessions WHERE user_id = ?", userId)?.c || 0);
}

/** قائمة الجلسات النشطة (لعرضها للمستخدم لاحقاً) — بلا أي بيانات حساسة */
/**
 * [M16] جلسات المستخدم النشطة.
 *
 * يُعاد token_hash كاملاً كمعرّف — لأن مسار DELETE /api/me/sessions/:id
 * يبحث بالهاش الكامل. كان يُقتطع إلى 12 حرفاً فيستحيل الحذف (خطأ مكتشف
 * أثناء التحقق: الاستعلام `WHERE token_hash=?` لا يطابق أبداً).
 */
export function listSessions(userId, currentTokenHash = "") {
  return all(
    `SELECT token_hash, created_at, expires_at, ip, ua
     FROM sessions WHERE user_id = ? ORDER BY created_at DESC`,
    userId,
  ).map((s) => ({
    id: s.token_hash,
    current: !!currentTokenHash && s.token_hash === currentTokenHash,
    created_at: s.created_at,
    expires_at: s.expires_at,
    ip: s.ip,
    ua: s.ua,
  }));
}

/** مهمة دورية شاملة */
export function runSessionMaintenance() {
  try {
    const a = purgeExpiredSessions();
    const b = purgeExpiredResetTokens();
    return { sessions: a, resetTokens: b };
  } catch (e) {
    logger.error("session maintenance failed", { message: e.message });
    return { sessions: 0, resetTokens: 0 };
  }
}
