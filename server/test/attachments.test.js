import test from "node:test";
import assert from "node:assert/strict";

import { run, one, all, now } from "../db.js";
import { uid } from "../lib/util.js";
import {
  registerAttachments, registerRequestFiles, registerTicketFiles,
  getAttachment, userCanAccess, unregisterAttachments, backfillAttachments,
} from "../services/attachments.js";

/*
 * [M14] سجل المرفقات المفهرس.
 *
 * هذه الاختبارات تكتب في قاعدة الاختبار الحقيقية (data/mana.db في وضع
 * التطوير) ثم تنظّف ما أنشأته، فلا تترك أثراً.
 */
const created = { offers: [], users: [], requests: [], attachments: [] };

function mkUser(role = "client") {
  const id = uid("TSTU");
  run(
    `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,created_at,updated_at)
     VALUES (?,?,?,?,?,'','${role}',1,?,?)`,
    id, "مستخدم اختبار", `${id}@test.local`, "+967700000000", "x", now(), now(),
  );
  created.users.push(id);
  return id;
}

function mkOffer(owner) {
  const id = uid("TSTO");
  run(
    `INSERT INTO offers (id,title,summary,description_html,terms_html,image,status,version,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,1,?,?,?)`,
    id, "عرض اختبار", "وصف مختصر لاختبار سجل المرفقات", "<p>ت</p>", "", "", "published", owner, now(), now(),
  );
  created.offers.push(id);
  return id;
}

function mkRequest(offerId, userId, filesJson = "[]") {
  const id = uid("TSTR");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM requests").c);
  run(
    `INSERT INTO requests (id,seq,offer_id,user_id,notes,files,status,version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'new',1,?,?)`,
    id, seq, offerId, userId, "ملاحظة اختبار", filesJson, now(), now(),
  );
  created.requests.push(id);
  return id;
}

test.after(() => {
  for (const id of created.requests) run("DELETE FROM requests WHERE id=?", id);
  for (const id of created.offers) run("DELETE FROM offers WHERE id=?", id);
  for (const p of created.attachments) run("DELETE FROM attachments WHERE path=?", p);
  for (const id of created.users) run("DELETE FROM users WHERE id=?", id);
});

/* ============================================================
   التسجيل والقراءة
============================================================ */
test("registerAttachments يسجّل كل ملف ويعيد العدد", () => {
  const owner = uid("TSTOWN");
  const uploader = mkUser();
  const files = [
    { path: `attachments/${uid("a")}.png`, name: "أ.png", mime: "image/png", size: 10 },
    { path: `attachments/${uid("b")}.pdf`, name: "ب.pdf", mime: "application/pdf", size: 20 },
  ];
  files.forEach((f) => created.attachments.push(f.path));

  const n = registerAttachments(files, { ownerType: "request", ownerId: owner, uploaderId: uploader });
  assert.equal(n, 2);

  for (const f of files) {
    const row = getAttachment(f.path);
    assert.ok(row, `لم يُسجَّل: ${f.path}`);
    assert.equal(row.owner_type, "request");
    assert.equal(row.owner_id, owner);
    assert.equal(row.uploader_id, uploader);
  }
});

test("registerAttachments يتجاهل المدخلات الفارغة والناقصة", () => {
  const uploader = mkUser();
  assert.equal(registerAttachments([], { ownerType: "request", ownerId: "x", uploaderId: uploader }), 0);
  assert.equal(registerAttachments(null, { ownerType: "request", ownerId: "x", uploaderId: uploader }), 0);
  assert.equal(registerAttachments([{ name: "بلا مسار" }], { ownerType: "request", ownerId: "x", uploaderId: uploader }), 0);
});

test("getAttachment يُعيد null لمسار غير مسجّل", () => {
  assert.equal(getAttachment("attachments/does-not-exist.png"), null);
});

/* ============================================================
   [M4] صلاحيات التنزيل — هذا هو جوهر الإصلاح
============================================================ */
test("userCanAccess: صاحب الطلب يستطيع، والآخر لا", () => {
  const owner = mkUser();
  const stranger = mkUser();
  const offer = mkOffer(owner);
  const p = `attachments/${uid("c")}.png`;
  created.attachments.push(p);

  const reqId = mkRequest(offer, owner, JSON.stringify([{ path: p, name: "c.png", mime: "image/png", size: 5 }]));
  registerRequestFiles([{ path: p, name: "c.png", mime: "image/png", size: 5 }], reqId, owner);

  assert.ok(userCanAccess(owner, p), "صاحب الطلب مُنع من ملفه");
  assert.equal(userCanAccess(stranger, p), null, "عميل آخر وصل إلى ملف ليس له");
  assert.equal(userCanAccess(owner, "attachments/nope.png"), null);
});

test("userCanAccess: من رفع الملف يملكه ولو لم يكن صاحب الكيان", () => {
  const uploader = mkUser();
  const other = mkUser();
  const p = `attachments/${uid("d")}.png`;
  created.attachments.push(p);

  registerAttachments([{ path: p, name: "d.png", mime: "image/png", size: 1 }], {
    ownerType: "request", ownerId: uid("OTHER"), uploaderId: uploader,
  });

  assert.ok(userCanAccess(uploader, p));
  assert.equal(userCanAccess(other, p), null);
});

test("userCanAccess: مرفقات التذاكر تتبع مالك التذكرة", () => {
  const owner = mkUser();
  const stranger = mkUser();
  const p = `attachments/${uid("e")}.png`;
  created.attachments.push(p);

  const tId = uid("TSTT");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM tickets").c);
  run(
    `INSERT INTO tickets (id,seq,user_id,subject,message,files,status,version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'open',1,?,?)`,
    tId, seq, owner, "تذكرة اختبار", "وصف المشكلة هنا بالتفصيل الكافي", "[]", now(), now(),
  );
  registerTicketFiles([{ path: p, name: "e.png", mime: "image/png", size: 1 }], tId, owner);
  try {
    assert.ok(userCanAccess(owner, p));
    assert.equal(userCanAccess(stranger, p), null);
  } finally {
    run("DELETE FROM tickets WHERE id=?", tId);
  }
});

test("userCanAccess: ملفات media/ لا تُمنح عبر /api/files لغير رافعها", () => {
  const uploader = mkUser();
  const stranger = mkUser();
  const p = `media/${uid("f")}.png`;
  created.attachments.push(p);
  registerAttachments([{ path: p, name: "f.png", mime: "image/png", size: 1 }], {
    ownerType: "media", ownerId: uid("MED"), uploaderId: uploader,
  });
  /*
   * قاعدة "من رفع الملف يملكه" تسري أولاً، فالرافع يحصل عليها.
   * أما أي مستخدم آخر فلا — وهذا هو المهم، لأن ملفات media تُعرض
   * عبر /api/up/:name بعد فحص جدول media، و /api/files تفحص الأدمن صراحةً.
   */
  assert.ok(userCanAccess(uploader, p));
  assert.equal(userCanAccess(stranger, p), null);
});

/* ============================================================
   الحذف والترحيل
============================================================ */
test("unregisterAttachments يحذف ويعيد المسارات", () => {
  const owner = uid("TSTGONE");
  const uploader = mkUser();
  const p = `attachments/${uid("g")}.png`;
  created.attachments.push(p);
  registerAttachments([{ path: p, name: "g.png", mime: "image/png", size: 1 }], {
    ownerType: "request", ownerId: owner, uploaderId: uploader,
  });

  const removed = unregisterAttachments("request", owner);
  assert.deepEqual(removed, [p]);
  assert.equal(getAttachment(p), null);
  /* الحذف الثاني لا يفشل */
  assert.deepEqual(unregisterAttachments("request", owner), []);
});

test("backfillAttachments آمن للتكرار ولا يضاعف الصفوف", () => {
  const a = backfillAttachments();
  const b = backfillAttachments();
  assert.equal(typeof a, "number");
  /* التكرار لا يضيف شيئاً لأن path UNIQUE */
  assert.equal(b, 0, `التكرار أضاف ${b} صفاً`);
});

test("path UNIQUE يمنع تكرار الصف — INSERT OR IGNORE يتجاهل الثاني", () => {
  const uploader = mkUser();
  const owner1 = uid("O1");
  const owner2 = uid("O2");
  const p = `attachments/${uid("h")}.png`;
  created.attachments.push(p);

  registerAttachments([{ path: p, name: "h.png", mime: "image/png", size: 1 }], {
    ownerType: "request", ownerId: owner1, uploaderId: uploader,
  });
  /* الإدراج الثاني لنفس المسار يُتجاهل بدل أن يرمي (حتى لا يفشل الطلب كله) */
  registerAttachments([{ path: p, name: "h2.png", mime: "image/png", size: 1 }], {
    ownerType: "request", ownerId: owner2, uploaderId: uploader,
  });

  const rows = all("SELECT * FROM attachments WHERE path=?", p);
  assert.equal(rows.length, 1, `مسار مكرر: ${rows.length} صف`);
  assert.equal(rows[0].owner_id, owner1, "التسجيل الأول هو الذي يبقى");
});

test("كل صفوف attachments تملك الحقول الإلزامية", () => {
  const rows = all("SELECT * FROM attachments");
  for (const r of rows) {
    assert.ok(r.id, "id ناقص");
    assert.ok(r.path, "path ناقص");
    assert.ok(["request", "request_info", "ticket", "ticket_reply", "media"].includes(r.owner_type),
      `owner_type غير معروف: ${r.owner_type}`);
    assert.ok(r.owner_id, "owner_id ناقص");
    assert.ok(r.uploader_id, "uploader_id ناقص");
    assert.ok(r.created_at, "created_at ناقص");
  }
});
