import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { all } from "../db.js";
import { jsonParse } from "../lib/util.js";
import { requireAuth } from "../lib/http.js";
import { config } from "../config.js";

export const files = Router();

/**
 * تنزيل المرفقات الخاصة — يسمح فقط لصاحب الطلب/التذكرة أو الأدمن.
 * المسار يُمرَّر مشفراً: /api/files?p=attachments/xxx
 */
files.get("/", requireAuth, (req, res) => {
  const p = String(req.query.p || "");
  if (!/^(attachments|media)\/[A-Za-z0-9._-]+$/.test(p))
    return res.status(400).json({ ok: false, error: "الملف المطلوب غير متوفر" });
  const user = req.user;

  if (user.role !== "admin") {
    const owns = ownsPath(user.id, p);
    if (!owns) {
      return res.status(404).json({ ok: false, error: "الملف غير موجود أو ليس لديك صلاحية للوصول إليه" });
    }
  }

  const abs = path.join(config.dataDir, "uploads", p);
  if (!abs.startsWith(config.dataDir) || !fs.existsSync(abs))
    return res.status(404).json({ ok: false, error: "الملف المطلوب غير متوفر أو تم حذفه" });

  const base = path.basename(p);
  const meta = findMeta(user.id, p);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(meta?.name || base)}"`);
  res.setHeader("Content-Type", meta?.mime || "application/octet-stream");
  fs.createReadStream(abs).pipe(res);
});

function ownsPath(userId, p) {
  return !!findMeta(userId, p);
}

function findMeta(userId, p) {
  const requests = all("SELECT id,user_id,files FROM requests WHERE user_id=? AND files LIKE ?", userId, `%${p}%`);
  for (const r of requests) {
    const meta = (jsonParse(r.files, []) || []).find((f) => f.path === p);
    if (meta) return meta;
    const infos = all("SELECT files FROM request_info WHERE request_id=? AND files LIKE ?", r.id, `%${p}%`);
    for (const i of infos) {
      const m = (jsonParse(i.files, []) || []).find((f) => f.path === p);
      if (m) return m;
    }
  }
  const tickets = all("SELECT id,user_id,files FROM tickets WHERE user_id=? AND files LIKE ?", userId, `%${p}%`);
  for (const t of tickets) {
    const m = (jsonParse(t.files, []) || []).find((f) => f.path === p);
    if (m) return m;
    const reps = all("SELECT files FROM ticket_replies WHERE ticket_id=? AND by_type='client' AND files LIKE ?", t.id, `%${p}%`);
    for (const r of reps) {
      const mm = (jsonParse(r.files, []) || []).find((f) => f.path === p);
      if (mm) return mm;
    }
  }
  return null;
}
