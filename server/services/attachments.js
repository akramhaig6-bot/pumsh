import fs from "node:fs";
import path from "node:path";
import { db, all, one, run, now } from "../db.js";
import { uid, jsonParse } from "../lib/util.js";
import { config } from "../config.js";
import logger from "../lib/logger.js";

/**
 * [M14] سجل المرفقات المفهرس.
 *
 * قبل الإصلاح كان التحقق من ملكية ملف يتم بـ LIKE '%path%' على requests
 * ثم LIKE متداخل على request_info لكل طلب مطابق، ثم نفس الشيء على
 * tickets و ticket_replies — أي N+1 مع مسح كامل لا ينفعه أي فهرس.
 *
 * الآن: سجل واحد مفهرس بـ path UNIQUE، واستعلام واحد.
 */

const insertStmt = () =>
  db.prepare(
    `INSERT OR IGNORE INTO attachments
       (id, path, name, mime, size, owner_type, owner_id, uploader_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );

/**
 * يسجّل قائمة مرفقات لكيان مالك.
 * @param {Array<{path,name,mime,size}>} files
 * @param {{ownerType:string, ownerId:string, uploaderId:string}} ctx
 */
export function registerAttachments(files, { ownerType, ownerId, uploaderId }) {
  if (!Array.isArray(files) || !files.length) return 0;
  const stmt = insertStmt();
  const at = now();
  let n = 0;
  for (const f of files) {
    if (!f?.path) continue;
    stmt.run(
      uid("ATT"),
      f.path,
      String(f.name || "").slice(0, 200),
      String(f.mime || ""),
      Number(f.size) || 0,
      ownerType,
      ownerId,
      uploaderId,
      at,
    );
    n++;
  }
  return n;
}

/** تسجيل مرفقات طلب جديد */
export const registerRequestFiles = (files, requestId, uploaderId) =>
  registerAttachments(files, { ownerType: "request", ownerId: requestId, uploaderId });

export const registerRequestInfoFiles = (files, infoId, uploaderId) =>
  registerAttachments(files, { ownerType: "request_info", ownerId: infoId, uploaderId });

export const registerTicketFiles = (files, ticketId, uploaderId) =>
  registerAttachments(files, { ownerType: "ticket", ownerId: ticketId, uploaderId });

export const registerTicketReplyFiles = (files, replyId, uploaderId) =>
  registerAttachments(files, { ownerType: "ticket_reply", ownerId: replyId, uploaderId });

export const registerMediaFiles = (files, mediaId, uploaderId) =>
  registerAttachments(files, { ownerType: "media", ownerId: mediaId, uploaderId });

/** بيانات وصفية لمرفق بمساره */
export function getAttachment(path) {
  return one("SELECT * FROM attachments WHERE path = ?", path) || null;
}

/**
 * هل يملك هذا المستخدم حق تنزيل المرفق؟
 * القاعدة:
 *   - من رفع الملف يملكه دائماً.
 *   - صاحب الطلب/التذكرة (أو أي رد/معلومة تابعة لهما) يملكه.
 *   - الأدمن يملك كل شيء (يُفحص في المسار قبل استدعاء هذه الدالة).
 */
export function userCanAccess(userId, path) {
  const a = getAttachment(path);
  if (!a) return null;
  if (a.uploader_id === userId) return a;

  switch (a.owner_type) {
    case "request": {
      const r = one("SELECT id FROM requests WHERE id = ? AND user_id = ?", a.owner_id, userId);
      return r ? a : null;
    }
    case "request_info": {
      const r = one(
        `SELECT r.id FROM request_info i
         JOIN requests r ON r.id = i.request_id
         WHERE i.id = ? AND r.user_id = ?`,
        a.owner_id,
        userId,
      );
      return r ? a : null;
    }
    case "ticket": {
      const t = one("SELECT id FROM tickets WHERE id = ? AND user_id = ?", a.owner_id, userId);
      return t ? a : null;
    }
    case "ticket_reply": {
      const t = one(
        `SELECT t.id FROM ticket_replies tr
         JOIN tickets t ON t.id = tr.ticket_id
         WHERE tr.id = ? AND t.user_id = ?`,
        a.owner_id,
        userId,
      );
      return t ? a : null;
    }
    case "media":
      /* ملفات مكتبة الوسائط عامة عبر /api/up — لا تُخدم عبر /api/files */
      return null;
    default:
      return null;
  }
}

/** حذف سجلات مرفقات كيان (عند حذف طلب/تذكرة) */
export function unregisterAttachments(ownerType, ownerId) {
  const rows = all("SELECT path FROM attachments WHERE owner_type = ? AND owner_id = ?", ownerType, ownerId);
  run("DELETE FROM attachments WHERE owner_type = ? AND owner_id = ?", ownerType, ownerId);
  return rows.map((r) => r.path);
}

/**
 * ترحيل: يبني سجل المرفقات من أعمدة JSON في القواعد القائمة.
 * آمن للتكرار (INSERT OR IGNORE).
 */
export function backfillAttachments() {
  const before = Number(one("SELECT COUNT(*) c FROM attachments")?.c || 0);
  const stmt = insertStmt();
  let added = 0;

  const scan = (sql, ownerType, idField, uploaderSql) => {
    let rows = [];
    try {
      rows = all(sql);
    } catch (e) {
      logger.debug("backfill scan skipped", { ownerType, message: e.message });
      return;
    }
    for (const row of rows) {
      const files = jsonParse(row.files, []) || [];
      for (const f of files) {
        if (!f?.path) continue;
        stmt.run(
          uid("ATT"),
          f.path,
          String(f.name || "").slice(0, 200),
          String(f.mime || ""),
          Number(f.size) || 0,
          ownerType,
          row[idField],
          row.uploader_id || "",
          row.created_at || now(),
        );
        added++;
      }
    }
  };

  scan(
    "SELECT id, files, user_id AS uploader_id, created_at FROM requests WHERE files != '[]'",
    "request", "id",
  );
  scan(
    `SELECT i.id, i.files, r.user_id AS uploader_id, i.created_at
     FROM request_info i JOIN requests r ON r.id = i.request_id WHERE i.files != '[]'`,
    "request_info", "id",
  );
  scan(
    "SELECT id, files, user_id AS uploader_id, created_at FROM tickets WHERE files != '[]'",
    "ticket", "id",
  );
  scan(
    `SELECT tr.id, tr.files, t.user_id AS uploader_id, tr.created_at
     FROM ticket_replies tr JOIN tickets t ON t.id = tr.ticket_id
     WHERE tr.files != '[]' AND tr.by_type = 'client'`,
    "ticket_reply", "id",
  );

  const after = Number(one("SELECT COUNT(*) c FROM attachments")?.c || 0);
  if (after > before) logger.info("attachments backfilled", { added: after - before, total: after });
  return after - before;
}

/**
 * [M5] حذف ملفات يتيمة على القرص: ملفات موجودة في مجلدات الرفع
 * لكن لا سجل لها في attachments ولا إشارة لها في media.
 * يُستدعى يدوياً فقط (npm run sweep-files) لأن الحذف لا رجعة فيه.
 */
export function findOrphanFiles({ limit = 500 } = {}) {
  const known = new Set(all("SELECT path FROM attachments").map((r) => r.path));
  for (const m of all("SELECT path FROM media")) known.add(m.path);

  const orphans = [];
  for (const kind of ["media", "attachments"]) {
    const dir = path.join(config.uploadDir, kind);
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const rel = `${kind}/${name}`;
      if (!known.has(rel)) orphans.push(rel);
      if (orphans.length >= limit) return orphans;
    }
  }
  return orphans;
}
