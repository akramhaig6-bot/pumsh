import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { uid, token } from "./util.js";
import { mediaDir, attachmentsDir, config } from "../config.js";

const ALLOWED = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

export const allowedMimes = Object.keys(ALLOWED);
export const imageMimes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

export function extensionFor(mime) {
  return ALLOWED[mime]?.[0] || ".bin";
}

export function validateFile(file, { imagesOnly = false, maxMB } = {}) {
  if (!file) return "يرجى اختيار ملف أولاً";
  if (imagesOnly && !imageMimes.includes(file.mimetype))
    return "صيغة الصورة غير مدعومة — الصيغ المقبولة: JPG, PNG, WEBP, SVG";
  if (!imagesOnly && !ALLOWED[file.mimetype])
    return "صيغة الملف غير مدعومة — الصيغ المقبولة: JPG, PNG, WEBP, SVG, PDF, DOC, DOCX";
  const max = maxMB || config.maxFileMB;
  if (file.size > max * 1024 * 1024)
    return `حجم الملف يتجاوز الحد الأقصى المسموح (${max} ميغابايت)`;
  return null;
}

/** Multer: تخزين مؤقت في الذاكرة ثم كتابة آمنة بعد التحقق */
export const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 12 },
});

/** حفظ ملف مُتحقق منه إلى مجلد — يعيد {path, storedName, size, mime} */
export function persistFile(file, kind = "media") {
  const dir = kind === "media" ? mediaDir : attachmentsDir;
  const stored = `${Date.now().toString(36)}-${uid("F").slice(-8)}${extensionFor(file.mimetype)}`;
  const abs = path.join(dir, stored);
  fs.writeFileSync(abs, file.buffer);
  return {
    storedName: stored,
    path: path.join(kind === "media" ? "media" : "attachments", stored),
    size: file.size,
    mime: file.mimetype,
    original_name: file.originalname || stored,
  };
}

export function removeStored(p) {
  if (!p) return;
  try {
    const abs = path.join(config.dataDir, "uploads", p);
    if (abs.startsWith(config.dataDir) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* تجاهل */
  }
}

/** تحويل ملفات multer إلى نموذج مرفق تخزيني للمرفقات */
export function toAttachment(file) {
  const meta = persistFile(file, "attachments");
  return {
    path: meta.path,
    name: file.originalname || meta.storedName,
    size: meta.size,
    mime: meta.mime,
  };
}

export function toPublicAttachment(a) {
  const p = String(a.path || "");
  const isMedia = p.startsWith("media/");
  return {
    name: a.name,
    size: a.size,
    mime: a.mime,
    // صور الوسائط عامة للمحتوى، المرفقات خاصة (تتطلب جلسة المالك/الأدمن)
    url: isMedia
      ? `/api/up/${encodeURIComponent(p.slice("media/".length))}`
      : `/api/files?p=${encodeURIComponent(p)}`,
  };
}
