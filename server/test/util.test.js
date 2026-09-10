import test from "node:test";
import assert from "node:assert/strict";

import {
  hashPassword, verifyPassword, slugify, escapeLike, pagination, pager,
  sha256, publicUser, arMinutes, arCount, uid, token,
} from "../lib/util.js";

/* ============================================================
   [M17] كلمات المرور — scrypt غير متزامن
============================================================ */
test("hashPassword يُنتج salt وhash وencoded بصيغة scrypt$", async () => {
  const { salt, hash, encoded } = await hashPassword("Str0ngPass!");
  assert.equal(typeof salt, "string");
  assert.ok(salt.length >= 32, "salt قصير");
  assert.equal(typeof hash, "string");
  assert.ok(encoded.startsWith("scrypt$"), `صيغة غير متوقعة: ${encoded}`);
  /* 6 حقول: scrypt$N$r$p$salt$hash */
  assert.equal(encoded.split("$").length, 6);
});

test("hashPassword لا يُنتج نفس الهاش لنفس كلمة المرور (salt عشوائي)", async () => {
  const a = await hashPassword("SamePass@1");
  const b = await hashPassword("SamePass@1");
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.salt, b.salt);
});

test("verifyPassword يقبل الصيغة الجديدة (encoded)", async () => {
  const { salt, encoded } = await hashPassword("Corr3ct!Pass");
  assert.equal(await verifyPassword("Corr3ct!Pass", salt, encoded), true);
  assert.equal(await verifyPassword("WrongPass@1", salt, encoded), false);
});

test("verifyPassword يقبل الصيغة القديمة (salt + hash خام) للتوافق مع البيانات القائمة", async () => {
  /* هاش قديم مُولَّد بنفس معاملات scrypt في util.js */
  const crypto = await import("node:crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  const legacy = crypto.scryptSync("Legacy@1234", salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  assert.equal(await verifyPassword("Legacy@1234", salt, legacy), true);
  assert.equal(await verifyPassword("nope@1234", salt, legacy), false);
});

test("verifyPassword لا ترمي استثناءً على مدخلات تالفة", async () => {
  assert.equal(await verifyPassword("x", "", ""), false);
  assert.equal(await verifyPassword("x", null, null), false);
  assert.equal(await verifyPassword("", undefined, undefined), false);
});

test("verifyPassword موحّدة الزمن: لا ترمي عند اختلاف الأطوال", async () => {
  const { salt, encoded } = await hashPassword("Whatever@1");
  /* هاش بطول مختلف — timingSafeEqual يرمي لو لم نُطوّل/نُقصر */
  assert.equal(await verifyPassword("Whatever@1", salt, "short"), false);
});

/* ============================================================
   [M1] تهريب LIKE — يُستخدم مع ESCAPE '\\'
============================================================ */
test("escapeLike يهرّب % و _ و \\", () => {
  assert.equal(escapeLike("50% off"), "50\\% off");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("back\\slash"), "back\\\\slash");
  assert.equal(escapeLike("عربي %"), "عربي \\%");
  assert.equal(escapeLike(""), "");
  assert.equal(escapeLike(null), "");
});

/* ============================================================
   [M3] الترقيم
============================================================ */
test("pager يقيّد القيم الشاذة", () => {
  assert.deepEqual(pager(0, 10), { page: 1, per: 10 });
  assert.deepEqual(pager(-5, 10), { page: 1, per: 10 });
  const p = pager(3, 200);
  assert.equal(p.page, 3);
  assert.ok(p.per <= 100, `per غير مقيّد: ${p.per}`);
});

test("pagination يحسب عدد الصفحات ولا يقسّم على صفر", () => {
  assert.deepEqual(pagination(1, 12, 0), { page: 1, per: 12, total: 0, pages: 1 });
  assert.equal(pagination(1, 12, 13).pages, 2);
  assert.equal(pagination(2, 12, 13).pages, 2);
});

/* ============================================================
   أدوات عامة
============================================================ */
test("slugify يتعامل مع العربية والأحرف الخاصة", () => {
  assert.equal(slugify("عرض جديد 2024"), "عرض-جديد-2024");
  assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
  assert.equal(slugify(""), "");
});

test("sha256 ثابت الطول وقابل للتكرار", () => {
  assert.equal(sha256("abc").length, 64);
  assert.equal(sha256("abc"), sha256("abc"));
  assert.notEqual(sha256("abc"), sha256("abd"));
});

test("uid و token فريدان", () => {
  const ids = new Set(Array.from({ length: 500 }, () => uid("TST")));
  assert.equal(ids.size, 500);
  assert.ok(uid("TST").startsWith("TST-"));
  assert.equal(token(16).length, 32); // hex
});

test("publicUser لا يسرّب pass_hash ولا salt ولا failed", () => {
  const u = {
    id: "USR-1", name: "ن", email: "a@b.c", phone: "+967700000000", role: "client",
    active: 1, must_change: 0, created_at: "x", last_login_at: null,
    pass_hash: "SECRET-HASH", salt: "SECRET-SALT", failed: 3, failed_at: "y", locked_until: "z",
  };
  const p = publicUser(u);
  assert.equal(p.pass_hash, undefined);
  assert.equal(p.salt, undefined);
  assert.equal(p.failed, undefined);
  assert.equal(p.locked_until, undefined);
  assert.equal(p.email, "a@b.c");
});

test("publicUser(null) يُعيد null", () => {
  assert.equal(publicUser(null), null);
});

/* ============================================================
   صياغة عربية
============================================================ */
test("arMinutes يصيغ المدد", () => {
  assert.match(arMinutes(1), /دقيقة/);
  assert.match(arMinutes(5), /دقائق/);
  assert.match(arMinutes(20), /دقيقة/);
});

test("arCount يختار الصيغة الصحيحة", () => {
  const f = { one: "واحد", two: "اثنان", few: "عدة", many: "كثير" };
  assert.equal(arCount(1, f), "واحد");
  assert.equal(arCount(2, f), "اثنان");
  assert.equal(arCount(5, f), "5 عدة");
  assert.equal(arCount(10, f), "10 عدة");
  assert.equal(arCount(15, f), "15 كثير");
  assert.equal(arCount(0, f), "0 كثير");
});
