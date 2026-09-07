import { Router } from "express";
import { uploader, validateFile, toAttachment, toPublicAttachment } from "../lib/upload.js";
import { requireAuth, failure } from "../lib/http.js";

export const uploads = Router();

/**
 * رفع عام لأي مستخدم مسجل — يخزن في data/uploads/media ويستخدم في المحتوى.
 * النتيجة: url يخدم عبر GET /api/files/*  (لا يكشف الملفات كمجرد static).
 */
uploads.post("/", requireAuth, uploader.array("files", 1), (req, res) => {
  const f = req.files?.[0];
  if (!f) return failure(res, 422, "لم يتم إرسال ملف");
  const err = validateFile(f);
  if (err) return failure(res, 422, err);
  const att = toAttachment(f);
  res.json({ ok: true, media: { ...att, ...toPublicAttachment(att) } });
});
