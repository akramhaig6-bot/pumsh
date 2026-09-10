import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { issueCsrfToken, verifyCsrfToken, CSRF_ANON } from "../lib/http.js";
import { isOriginAllowed, normalizeOrigin, checkRequestOrigin } from "../lib/cors.js";
import { config } from "../config.js";

/* أدوات مساعدة: كائنات req/res مصغّرة بلا Express */
const mkReq = ({ headers = {}, method = "POST", path = "/x", protocol = "http", cookies = {} } = {}) => ({
  headers, method, path, protocol, cookies,
  get(name) {
    return headers[String(name).toLowerCase()];
  },
});

const mkRes = () => {
  const res = {
    status: 200,
    body: null,
    statusCode(code) {
      res.status = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

/* ============================================================
   [M12] توكن CSRF الموقّع
============================================================ */
test("issueCsrfToken بلا جلسة يُنتج توكن بنطاق anon", () => {
  const req = mkReq({ cookies: {} });
  const t = issueCsrfToken(req);
  const scope = Buffer.from(t.split(".")[0], "base64url").toString("utf8");
  assert.ok(scope.startsWith("anon."), `النطاق ليس anon: ${scope}`);
});

test("verifyCsrfToken يقبل التوكن الصادر لنفس الحالة", () => {
  const req = mkReq({ cookies: {} });
  const t = issueCsrfToken(req);
  assert.equal(verifyCsrfToken(req, t), true);
});

test("verifyCsrfToken يرفض التوكن الموقّع بمفتاح مختلف", () => {
  const req = mkReq({ cookies: {} });
  const t = issueCsrfToken(req);
  const [payload, sig] = t.split(".");
  const forged = crypto.createHmac("sha256", "مفتاح-آخر").update(payload).digest("base64url");
  assert.equal(verifyCsrfToken(req, `${payload}.${forged}`), false);
});

test("verifyCsrfToken يرفض التوكن المرتبط بجلسة أخرى", () => {
  const a = mkReq({ cookies: { [config.sessionCookieName]: "session-A-token" } });
  const b = mkReq({ cookies: { [config.sessionCookieName]: "session-B-token" } });
  const t = issueCsrfToken(a);
  assert.equal(verifyCsrfToken(a, t), true);
  assert.equal(verifyCsrfToken(b, t), false, "توكن جلسة لا يصلح لجلسة أخرى");
});

test("issueCsrfToken(req, newSessionToken) يربط التوكن بالجلسة الجديدة", () => {
  /*
   * هذا هو الإصلاح نفسه: عند الدخول يُضبط الكوكي على الاستجابة،
   * بينما req.cookies ما زال قديماً. بدونه يعود توكن anon
   * فيفشل أول طلب معدِّل بعد الدخول.
   */
  const reqAtLogin = mkReq({ cookies: {} });
  const newSession = "brand-new-session-token";
  const t = issueCsrfToken(reqAtLogin, newSession);

  const scope = Buffer.from(t.split(".")[0], "base64url").toString("utf8");
  assert.ok(!scope.startsWith("anon."), "التوكن ما زال بنطاق anon — الإصلاح لم يعمل");

  /* والطلب التالي الذي يحمل الكوكي الجديد يقبله */
  const reqAfter = mkReq({ cookies: { [config.sessionCookieName]: newSession } });
  assert.equal(verifyCsrfToken(reqAfter, t), true);
  /* ولا يقبله طلب مجهول */
  assert.equal(verifyCsrfToken(mkReq({ cookies: {} }), t), false);
});

test("issueCsrfToken(req, CSRF_ANON) يفرض النطاق المجهول بعد الخروج", () => {
  const req = mkReq({ cookies: { [config.sessionCookieName]: "old-session" } });
  const t = issueCsrfToken(req, CSRF_ANON);
  const scope = Buffer.from(t.split(".")[0], "base64url").toString("utf8");
  assert.ok(scope.startsWith("anon."), `متوقّع anon، حصلنا على: ${scope}`);
  assert.equal(verifyCsrfToken(mkReq({ cookies: {} }), t), true);
});

test("verifyCsrfToken يرفض التوكن المنتهي (نافذة قديمة)", () => {
  const req = mkReq({ cookies: {} });
  const t = issueCsrfToken(req);
  const [b64, sig] = t.split(".");
  const [, bucketStr] = Buffer.from(b64, "base64url").toString("utf8").split(".");
  /* نعيد بناء نفس الحمولة بنافذة أقدم بثلاث نوافذ — ونوقّعها بمفتاح الخادم */
  const oldPayload = `anon.${Number(bucketStr) - 3}`;
  const oldB64 = Buffer.from(oldPayload).toString("base64url");
  const validSig = crypto
    .createHmac("sha256", config.csrfSecret)
    .update(oldPayload)
    .digest("base64url");
  /* التوقيع صحيح لكن النافذة منتهية → رفض */
  assert.equal(verifyCsrfToken(req, `${oldB64}.${validSig}`), false);
  assert.ok(sig.length > 10);
});

test("verifyCsrfToken يرفض المدخلات المشوّهة", () => {
  const req = mkReq({ cookies: {} });
  for (const bad of ["", null, undefined, "abc", "a.b.c", "!!!.!!!", "..", "x.y"]) {
    assert.equal(verifyCsrfToken(req, bad), false, `كان يجب رفض: ${String(bad)}`);
  }
});

/* ============================================================
   [C2] CORS — ALLOWED_ORIGINS حصراً
============================================================ */
test("isOriginAllowed يرفض أصلاً غير مصرّح به", () => {
  assert.equal(isOriginAllowed("https://pwn.vercel.app"), false);
  assert.equal(isOriginAllowed("https://evil.example"), false);
  assert.equal(isOriginAllowed("null"), false);
  assert.equal(isOriginAllowed(""), false);
  assert.equal(isOriginAllowed(null), false);
});

test("isOriginAllowed لا يعتمد على اللاحقات ما لم تُفعَّل صراحةً", () => {
  /* اللاحقة الافتراضية فارغة — فأي نطاق ينتهي بـ .vercel.app مرفوض */
  if (config.originSuffixes.length === 0) {
    assert.equal(isOriginAllowed("https://anything.vercel.app"), false);
  }
});

test("normalizeOrigin يجرّد المسار ويحافظ على الأصل", () => {
  assert.equal(normalizeOrigin("https://a.com/path?q=1"), "https://a.com");
  assert.equal(normalizeOrigin("http://localhost:5173/"), "http://localhost:5173");
  assert.equal(normalizeOrigin("نص-غير-صالح"), "نص-غير-صالح");
});

/* ============================================================
   [M12] فحص Origin كطبقة ثانية
============================================================ */
test("checkRequestOrigin يقبل طلب same-origin", () => {
  const req = mkReq({
    headers: { origin: "http://localhost:8080", host: "localhost:8080" },
  });
  assert.equal(checkRequestOrigin(req), null);
});

test("checkRequestOrigin يرفض Origin غريباً", () => {
  const req = mkReq({
    headers: { origin: "https://pwn.vercel.app", host: "localhost:8080" },
  });
  assert.equal(checkRequestOrigin(req), "origin_not_allowed");
});

test("checkRequestOrigin يقبل طلباً بلا Origin ولا Referer (same-origin)", () => {
  const req = mkReq({ headers: { host: "localhost:8080" } });
  assert.equal(checkRequestOrigin(req), null);
});
