import { Router } from "express";
import { one, all } from "../db.js";
import { pager } from "../lib/util.js";
import { requireAuth } from "../lib/http.js";
import { markRead, markAllRead } from "../services/notify.js";

/** إشعارات موحدة للعميل والأدمن */
export const me = Router();
me.use(requireAuth);

me.get("/notifications", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 15);
  const read = String(req.query.read || "");
  const type = String(req.query.type || "");
  const rows = all(
    `SELECT * FROM notifications WHERE user_id=? ${read ? "AND read=?" : ""} ${type ? "AND type=?" : ""}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    req.user.id, ...(read ? [Number(read)] : []), ...(type ? [type] : []), per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM notifications WHERE user_id=? ${read ? "AND read=?" : ""} ${type ? "AND type=?" : ""}`,
    req.user.id, ...(read ? [Number(read)] : []), ...(type ? [type] : []),
  ).c;
  res.json({ ok: true, notifications: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

me.post("/notifications/:id/read", (req, res) => {
  const n = one("SELECT id FROM notifications WHERE id=? AND user_id=?", req.params.id, req.user.id);
  if (n) markRead(req.user.id, req.params.id);
  res.json({ ok: true });
});

me.post("/notifications/read-all", (req, res) => {
  markAllRead(req.user.id);
  res.json({ ok: true });
});
