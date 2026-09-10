import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import { uid } from "./util.js";
import { mediaDir, attachmentsDir, tmpUploadDir, config } from "../config.js";
import logger from "./logger.js";

/**
 * [C7] قائمة الصيغ المقبولة — SVG محذوف نهائياً.
 *
 * SVG صيغة قابلة لتنفيذ السكربت (يحتوي <script> و <foreignObject> و on*= handlers)،
 * وخدمتها من نفس الأصل تعني Stored XSS. لا توجد طريقة آمنة لقبولها دون
 * تعقيم كامل لـ DOM، وهو ما لا توفره أي مكتبة بشكل موثوق هنا.
 */
const ALLOWED = {
  "image/jpeg": { ext: ".jpg", kind: "image", magic: [[0, [0xff, 0xd8, 0xff]]] },
  "image/png": { ext: ".png", kind: "image", magic: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]] },
  "image/webp": { ext: ".webp", kind: "image", magic: [[0, "RIFF"], [8, "WEBP"]] },
  "application/pdf": { ext: ".pdf", kind: "doc", magic: [[0, "%PDF"]] },
  "application/msword": { ext: ".doc", kind: "doc", magic: [[0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]]] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: ".docx", kind: "doc", magic: [[0, "PK"]],
  },
};

export const allowedMimes = Object.keys(ALLOWED);
export const imageMimes = allowedMimes.filter((m) => ALLOWED[m].kind === "image");
export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx";

export function extensionFor(mime) {
  return ALLOWED[mime]?.ext || ".bin";
}

/* ============================================================
   كشف النوع الحقيقي من بايتات الملف — لا نثق بـ Content-Type القادم من العميل
============================================================ */
function matchAt(buf, offset, expected) {
  if (typeof expected === "string") {
    if (buf.length < offset + expected.length) return false;
    return buf.subarray(offset, offset + expected.length).toString("latin1") === expected;
  }
  if (buf.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buf[offset + i] !== expected[i]) return false;
  }
  return true;
}

/** يعيد نوع MIME الحقيقي المستنتج من البايتات، أو null إن لم يتطابق أي نوع */
export function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  for (const [mime, spec] of Object.entries(ALLOWED)) {
    if (spec.magic.every(([off, exp]) => matchAt(buffer, off, exp))) return mime;
  }
  return null;
}

/* ============================================================
   التحقق
============================================================ */
export function validateFile(file, { imagesOnly = false } = {}) {
  if (!file) return "يرجى اختيار ملف أولاً";

  const declared = file.mimetype;
  if (!ALLOWED[declared]) {
    return imagesOnly
      ? "صيغة الصورة غير مدعومة — الصيغ المقبولة: JPG, PNG, WEBP"
      : "صيغة الملف غير مدعومة — الصيغ المقبولة: JPG, PNG, WEBP, PDF, DOC, DOCX";
  }
  if (imagesOnly && ALLOWED[declared].kind !== "image") {
    return "يُقبل رفع الصور فقط هنا — الصيغ المقبولة: JPG, PNG, WEBP";
  }
  if (file.size > config.maxFileMB * 1024 * 1024) {
    return `حجم الملف يتجاوز الحد الأقصى المسموح (${config.maxFileMB} ميغابايت)`;
  }
  return null;
}

/**
 * يتحقق من الملف ويعيد نوعه الحقيقي المستنتج من البايتات.
 * يعيد { error } أو { mime, ext }.
 */
export function verifyFileContent(file, { imagesOnly = false } = {}) {
  const err = validateFile(file, { imagesOnly });
  if (err) return { error: err };

  const sniffed = sniffMime(file.buffer);
  if (!sniffed) return { error: "محتوى الملف لا يطابق صيغته المعلنة — يرجى التأكد من سلامة الملف" };
  if (sniffed !== file.mimetype) {
    return { error: "امتداد الملف لا يطابق محتواه الفعلي — يرجى إعادة تسميته بالصيغة الصحيحة" };
  }
  if (imagesOnly && ALLOWED[sniffed].kind !== "image") {
    return { error: "يُقبل رفع الصور فقط هنا" };
  }
  return { mime: sniffed, ext: extensionFor(sniffed) };
}

/* ============================================================
   [M5] Multer — تخزين على القرص في مجلد مؤقت، وحدود من الإعدادات فعلياً

   لماذا diskStorage؟
   memoryStorage كان يحمّل حتى 100MB في الذاكرة قبل أي تحقق من الحجم،
   ومع 8 ملفات و60 طلباً/دقيقة كان استنزاف الذاكرة مباشراً.
   الآن: fileFilter يرفض الصيغ قبل الكتابة، و limits.fileSize يقطع
   الرفع من الحد الفعلي المضبوط في .env.
============================================================ */
export const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpUploadDir),
    filename: (_req, _file, cb) => cb(null, `tmp-${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`),
  }),
  limits: {
    fileSize: config.maxFileMB * 1024 * 1024,
    files: config.maxFilesPerRequest,
    fields: 30,
    fieldNameSize: 200,
    fieldSize: 100 * 1024,
    parts: 60,
  },
  fileFilter: (_req, file, cb) => {
    /* رفض مبكر قبل كتابة أي بايت على القرص */
    if (!ALLOWED[file.mimetype]) {
      const e = new Error("صيغة الملف غير مدعومة — الصيغ المقبولة: JPG, PNG, WEBP, PDF, DOC, DOCX");
      e.status = 422;
      return cb(e);
    }
    cb(null, true);
  },
});

/* ============================================================
   نقل الملفات المؤقتة إلى مكانها النهائي
============================================================ */
function writeTo(dir, buffer, ext) {
  const stored = `${Date.now().toString(36)}-${uid("F").slice(-8)}${ext}`;
  fs.writeFileSync(path.join(dir, stored), buffer);
  return stored;
}

/**
 * يقرأ ملفات multer المؤقتة ويحولها إلى مرفقات نهائية.
 * يعيد { files, error } — عند وجود خطأ تُحذف كل الملفات المرفوعة.
 */
export function consumeUploads(req, kind = "attachments", { imagesOnly = false } = {}) {
  const incoming = req.files || [];
  if (!incoming.length) return { files: [] };

  const out = [];
  for (const f of incoming) {
    let buffer = null;
    try {
      buffer = fs.readFileSync(f.path);
    } catch {
      continue;
    }
    /* نحقق على نسخة في الذاكرة بحجم محدود (الحد الأقصى مضبوط مسبقاً) */
    const probe = { mimetype: f.mimetype, size: f.size, buffer };
    const check = verifyFileContent(probe, { imagesOnly });
    if (check.error) {
      for (const g of incoming) safeUnlink(g.path);
      return { error: check.error };
    }

    const dir = kind === "media" ? mediaDir : attachmentsDir;
    const stored = writeTo(dir, buffer, check.ext);
    out.push({
      storedName: stored,
      path: `${kind === "media" ? "media" : "attachments"}/${stored}`,
      size: f.size,
      mime: check.mime,
      name: sanitizeName(f.originalname) || stored,
      original_name: sanitizeName(f.originalname) || stored,
    });
  }
  /* الملفات المؤقتة نُقلت/استُهلكت — احذف البقايا */
  for (const f of incoming) safeUnlink(f.path);
  return { files: out };
}

/** نموذج مرفق كما يُخزَّن في أعمدة JSON */
export function toAttachment(meta) {
  return { path: meta.path, name: meta.name, size: meta.size, mime: meta.mime };
}

/**
 * نموذج مرفق كما يُرسل للعميل.
 * [M10] لا يُسرَّب حقل path (مسار التخزين الداخلي) أبداً — فقط رابط التنزيل.
 */
export function toPublicAttachment(a) {
  const p = String(a?.path || "");
  const isMedia = p.startsWith("media/");
  const name = p.slice(p.lastIndexOf("/") + 1);
  return {
    name: a?.name || name,
    size: Number(a?.size) || 0,
    mime: a?.mime || "application/octet-stream",
    url: isMedia
      ? `/api/up/${encodeURIComponent(name)}`
      : `/api/files?p=${encodeURIComponent(p)}`,
  };
}

/* ============================================================
   تنظيف الملفات المؤقتة
============================================================ */
export function safeUnlink(p) {
  if (!p) return;
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    logger.debug("unlink failed", { path: p, message: e.message });
  }
}

/** يحذف أي ملفات مؤقتة لم تُستهلك (عند فشل التحقق أو خطأ في المعالج) */
export function discardUploads(req) {
  for (const f of req.files || []) safeUnlink(f.path);
}

/** وسيط: يضمن عدم بقاء ملفات مؤقتة بعد انتهاء أي طلب رفع */
export function uploadCleanup(req, res, next) {
  res.on("finish", () => discardUploads(req));
  res.on("close", () => discardUploads(req));
  next();
}

/**
 * اسم ملف آمن للعرض — يزيل أي تحكم بالمسار أو أحرف تحكم.
 *
 * التعبير يغطي محارف التحكم عمداً (0x00–0x1f) لأنها تصل فعلاً من أسماء
 * ملفات مرفوعة، وحذفها هنا يمنع كسر ترويسة Content-Disposition.
 */
export function sanitizeName(name) {
  return (
    String(name || "")
      /* eslint-disable-next-line no-control-regex */
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/]/g, "_")
      .trim()
      .slice(0, 180)
  );
}

/**
 * [M5] تنظيف دوري للملفات المؤقتة اليتيمة (رفع انقطع قبل المعالجة).
 * يُستدعى من server/index.js.
 */
export function sweepTmpUploads() {
  let removed = 0;
  try {
    const cutoff = Date.now() - 60 * 60 * 1000; // ساعة
    for (const entry of fs.readdirSync(tmpUploadDir)) {
      const abs = path.join(tmpUploadDir, entry);
      try {
        const st = fs.statSync(abs);
        if (st.isFile() && st.mtimeMs < cutoff) {
          fs.unlinkSync(abs);
          removed++;
        }
      } catch {
        /* ملف اختفى أثناء الفحص */
      }
    }
  } catch (e) {
    logger.warn("tmp sweep failed", { message: e.message });
  }
  if (removed) logger.info("swept orphan tmp uploads", { removed });
  return removed;
}
