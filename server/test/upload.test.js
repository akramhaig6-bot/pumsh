import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedMimes, imageMimes, ACCEPT_ATTR, extensionFor, sniffMime,
  validateFile, verifyFileContent, sanitizeName, toPublicAttachment,
} from "../lib/upload.js";

/* أدوات: ملف multer مصغّر */
const mkFile = (over = {}) => ({
  fieldname: "files",
  originalname: "صورة.png",
  mimetype: "image/png",
  size: 1024,
  path: "/tmp/uploads/tmp/abc.png",
  filename: "abc.png",
  ...over,
});

/* ============================================================
   [C7] قائمة الأنواع — لا SVG إطلاقاً
============================================================ */
test("SVG غير مقبول في أي قائمة", () => {
  assert.ok(!allowedMimes.includes("image/svg+xml"), "image/svg+xml ما زال مقبولاً");
  assert.ok(!ACCEPT_ATTR.toLowerCase().includes("svg"), "ACCEPT ما زال يذكر svg");
  /* نوع غير معروف → امتداد احتياطي آمن، لا امتداد قابل للتنفيذ */
  assert.equal(extensionFor("image/svg+xml"), ".bin");
});

test("الأنواع المقبولة محصورة بالقائمة المعلنة", () => {
  assert.deepEqual([...allowedMimes].sort(), [
    "application/msword",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
  ].sort());
});

test("imageMimes subset من allowedMimes", () => {
  for (const m of imageMimes) assert.ok(allowedMimes.includes(m), `${m} ليس في القائمة`);
  assert.ok(imageMimes.includes("image/jpeg"));
  assert.ok(!imageMimes.includes("application/pdf"));
});

test("extensionFor يُعيد امتداداً لكل نوع مقبول", () => {
  for (const m of allowedMimes) {
    const ext = extensionFor(m);
    assert.ok(ext, `لا امتداد لـ ${m}`);
    assert.match(ext, /^\.[a-z0-9]+$/);
  }
});

/* ============================================================
   [C7] كشف النوع من البايتات الأولى — لا ثقة بـ mimetype القادم من العميل
============================================================ */
/* رؤوس حقيقية ≥ 12 بايت — sniffMime يتجاهل ما هو أقصر عمداً */
const PNG_BUF = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
]);
const JPEG_BUF = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)]);
const WEBP_BUF = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(4)]);
const PDF_BUF = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(8)]);

test("sniffMime يتعرّف على PNG وJPEG وWEBP وPDF من البايتات", () => {
  assert.equal(sniffMime(PNG_BUF), "image/png");
  assert.equal(sniffMime(JPEG_BUF), "image/jpeg");
  assert.equal(sniffMime(WEBP_BUF), "image/webp");
  assert.equal(sniffMime(PDF_BUF), "application/pdf");
});

test("sniffMime يُعيد null لمحتوى غير معروف أو قصير", () => {
  assert.equal(sniffMime(Buffer.from("<svg><script>alert(1)</script></svg>")), null);
  assert.equal(sniffMime(Buffer.from("نص عادي")), null);
  assert.equal(sniffMime(Buffer.alloc(0)), null);
  /* أقصر من 12 بايت → لا محاولة تخمين */
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null);
});

test("verifyFileContent يرفض ملفاً يدّعي PNG ومحتواه SVG", () => {
  const f = mkFile({
    mimetype: "image/png",
    originalname: "evil.png",
    buffer: Buffer.concat([Buffer.from("<svg><script>alert(1)</script></svg>"), Buffer.alloc(8)]),
  });
  const r = verifyFileContent(f);
  assert.ok(r.error, "كان يجب رفض الملف");
  assert.match(r.error, /لا يطابق/);
});

test("verifyFileContent يرفض امتداداً لا يطابق المحتوى (PNG معلن ومحتوى JPEG)", () => {
  const f = mkFile({ mimetype: "image/png", originalname: "x.png", buffer: JPEG_BUF });
  const r = verifyFileContent(f);
  assert.ok(r.error, "كان يجب رفض عدم التطابق");
});

test("verifyFileContent يقبل PNG حقيقياً ويعيد نوعه وامتداده", () => {
  const f = mkFile({ mimetype: "image/png", originalname: "ok.png", buffer: PNG_BUF });
  const r = verifyFileContent(f);
  assert.equal(r.error, undefined);
  assert.equal(r.mime, "image/png");
  assert.equal(r.ext, ".png");
});

test("validateFile يفحص الصيغة المعلنة والحجم فقط", () => {
  assert.equal(validateFile(mkFile({ mimetype: "image/png" })), null);
  assert.ok(validateFile(mkFile({ mimetype: "image/svg+xml" })));
  assert.ok(validateFile(mkFile({ mimetype: "image/png", size: 999 * 1024 * 1024 })));
  assert.equal(validateFile(null), "يرجى اختيار ملف أولاً");
});

test("validateFile يرفض نوعاً غير مدعوم حتى لو كان المحتوى صحيحاً", () => {
  const f = mkFile({
    mimetype: "image/svg+xml",
    originalname: "x.svg",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  assert.ok(validateFile(f));
});

test("validateFile({imagesOnly:true}) يرفض PDF", () => {
  const f = mkFile({
    mimetype: "application/pdf",
    originalname: "doc.pdf",
    buffer: Buffer.from("%PDF-1.7"),
  });
  assert.ok(validateFile(f, { imagesOnly: true }), "كان يجب رفض PDF في وضع الصور فقط");
});

/* ============================================================
   [M10] لا تسريب لمسار التخزين الداخلي
============================================================ */
test("toPublicAttachment لا يكشف path ولا المسار المطلق", () => {
  const pub = toPublicAttachment({
    path: "attachments/secret-name.png",
    name: "ملفي.png",
    mime: "image/png",
    size: 2048,
  });
  assert.equal(pub.path, undefined, "path مكشوف");
  assert.equal(pub.name, "ملفي.png");
  assert.equal(pub.size, 2048);
  assert.equal(pub.mime, "image/png");
  /* الرابط يُبنى عبر /api/files?p= فقط */
  assert.ok(pub.url.startsWith("/api/files?p="), `رابط غير متوقع: ${pub.url}`);
  assert.ok(!JSON.stringify(pub).includes("attachments/"), "المسار الداخلي ظاهر في الاستجابة");
});

/* ============================================================
   تنظيف أسماء الملفات
============================================================ */
test("sanitizeName يزيل اجتياز المسار ومحارف التحكم", () => {
  assert.equal(sanitizeName("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(sanitizeName("a\\b/c.png"), "a_b_c.png");
  assert.equal(sanitizeName("ملف\u0000خفي.txt"), "ملفخفي.txt");
  assert.equal(sanitizeName(""), "");
  assert.equal(sanitizeName(null), "");
  assert.ok(sanitizeName("x".repeat(400)).length <= 180);
});
