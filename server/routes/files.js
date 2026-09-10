import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { one } from "../db.js";
import { failure, requireAuth } from "../lib/http.js";
import { userCanAccess, getAttachment } from "../services/attachments.js";
import { mediaDir, attachmentsDir } from "../config.js";
import { sanitizeName } from "../lib/upload.js";
import logger from "../lib/logger.js";

export const files = Router();

/**
 * تنزيل المرفقات الخاصة.
 *
 * [M4] كان الفحص يمرّ على `requests WHERE user_id=? AND files LIKE ?%` ثم
 * يمسح كل صفوف request_info/ticket_replies بـ LIKE أيضاً — وكل ذلك كان
 * يفشل عملياً لأن التسجيل في الجدول لم يكن يحدث، فأصبح تنزيل مرفق العميل
 * نفسه يُرجع 404.
 *
 * الآن: فهرس واحد على attachments(path) + فحص ملكية مباشر.
 * الاستعلام ثابت التكلفة مهما بلغ عدد الطلبات.
 */
files.get("/", requireAuth, (req, res) => {
  const p = String(req.query.p || "");

  /* المسار مقبول فقط بصيغة مجلد/اسم-ملف بلا أي مكونات مسارية */
  if (!/^(attachments|media)\/[A-Za-z0-9._-]+$/.test(p))
    return failure(res, 400, "الملف المطلوب غير متوفر");

  const user = req.user;

  /* [C1] ملفات media/ للأدمن فقط — ليست عامة لمجرد أن المستخدم مسجّل */
  if (p.startsWith("media/")) {
    if (user.role !== "admin") {
      logger.warn("media access denied", { userId: user.id, path: p });
      return failure(res, 404, "الملف غير موجود أو ليس لديك صلاحية للوصول إليه");
    }
    if (!one("SELECT id FROM media WHERE path=?", p))
      return failure(res, 404, "الملف المطلوب غير متوفر أو تم حذفه");
    return serve(res, p);
  }

  /* مرفقات الطلبات/التذاكر: المالك أو الأدمن فقط */
  if (!userCanAccess(user.id, p)) {
    if (user.role !== "admin") {
      logger.warn("attachment access denied", { userId: user.id, path: p });
      return failure(res, 404, "الملف غير موجود أو ليس لديك صلاحية للوصول إليه");
    }
    if (!getAttachment(p)) return failure(res, 404, "الملف المطلوب غير متوفر أو تم حذفه");
  }

  return serve(res, p);
});

function serve(res, p) {
  const dir = p.startsWith("media/") ? mediaDir : attachmentsDir;
  const abs = path.join(dir, path.basename(p));

  /* تأكيد مضاد لاجتياز المسار بعد الحلّ الكامل */
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs))
    return failure(res, 404, "الملف المطلوب غير متوفر أو تم حذفه");

  const meta = getAttachment(p);
  const st = fs.statSync(abs);
  const base = path.basename(abs);

  /* [C7] اسم الملف الأصلي قد يكون عربياً — نستخدم filename* RFC 5987 */
  const ascii = base.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(sanitizeName(meta?.name) || base)}`);
  res.setHeader("Content-Type", meta?.mime || "application/octet-stream");
  res.setHeader("Content-Length", String(st.size));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  fs.createReadStream(abs).on("error", (e) => {
    logger.error("attachment stream error", { path: p, message: e.message });
    if (!res.headersSent) failure(res, 500, "تعذّر قراءة الملف");
    else res.end();
  }).pipe(res);
}
