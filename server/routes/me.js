import { Router } from "express";
import { one, all, run } from "../db.js";
import { pager, pagination, unreadCount, sha256 } from "../lib/util.js";
import { failure, requireAuth, getRawToken } from "../lib/http.js";
import { markRead, markAllRead } from "../services/notify.js";
import { listSessions } from "../services/sessions.js";

/** إشعارات + جلسات — موحدة للعميل والأدمن */
export const me = Router();
me.use(requireAuth);

/**
 * إشعارات المستخدم الحالي.
 *
 * [M13] كان يُبنى الشرط بدمج نصي: `${read ? "AND read=?" : ""}` ثم يُمرَّر
 * العدد كوسيط منفصل — يعمل، لكنه هشّ وقابل للكسر. الآن الشروط تُبنى من
 * مصفوفة أزواج (جملة، قيمة) فلا انفصال ممكن بين SQL والوسائط.
 */
me.get("/notifications", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 15);

  const where = ["user_id=?"];
  const args = [req.user.id];

  if (req.query.read === "0" || req.query.read === "1") {
    where.push("read=?");
    args.push(Number(req.query.read));
  }
  if (typeof req.query.type === "string" && /^[a-z_]{1,40}$/.test(req.query.type)) {
    where.push("type=?");
    args.push(req.query.type);
  }

  const clause = where.join(" AND ");
  const rows = all(
    `SELECT id,type,title,body,entity_type,entity_id,status,read,created_at
     FROM notifications WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(`SELECT COUNT(*) c FROM notifications WHERE ${clause}`, ...args).c);

  res.json({ ok: true, notifications: rows, pagination: pagination(page, per, total), unread: unreadCount(req.user.id) });
});

me.post("/notifications/:id/read", (req, res) => {
  const n = one("SELECT id FROM notifications WHERE id=? AND user_id=?", req.params.id, req.user.id);
  if (n) markRead(req.user.id, req.params.id);
  res.json({ ok: true, unread: unreadCount(req.user.id) });
});

me.post("/notifications/read-all", (req, res) => {
  markAllRead(req.user.id);
  res.json({ ok: true, unread: 0 });
});

/* ============================================================
   [M16] الجلسات النشطة — يرى المستخدم أين هو مسجّل الدخول
============================================================ */
me.get("/sessions", (req, res) => {
  /* الجلسة الحالية تُحدَّد ببصمة التوكن لا بقيمته الخام */
  const raw = getRawToken(req);
  res.json({ ok: true, sessions: listSessions(req.user.id, raw ? sha256(raw) : "") });
});

me.delete("/sessions/:tokenHash", (req, res) => {
  const row = one("SELECT token_hash FROM sessions WHERE token_hash=? AND user_id=?", req.params.tokenHash, req.user.id);
  if (!row) return failure(res, 404, "الجلسة غير موجودة");
  run("DELETE FROM sessions WHERE token_hash=?", row.token_hash);
  res.json({ ok: true, sessions: listSessions(req.user.id) });
});
