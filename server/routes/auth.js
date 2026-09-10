import { Router } from "express";
import { run, one, now } from "../db.js";
import {
  uid, token, sha256, createSession, revokeAllSessions, verifyPassword, hashPassword,
  unreadCount, arMinutes, publicUser,
} from "../lib/util.js";
import {
  parse, failure, asyncH, requireAuth, requestIp, userAgent,
  issueCsrfToken, CSRF_ANON,
} from "../lib/http.js";
import {
  registerSchema, loginSchema, forgotSchema, resetSchema, changePasswordSchema,
  profileSchema, createCaptcha, verifyCaptcha,
} from "../lib/validate.js";
import { sendMail, mailTemplate } from "../lib/mailer.js";
import { config } from "../config.js";
import { isCrossOriginRequest } from "../lib/cors.js";
import { logEvent } from "../services/events.js";
import { notifyAdmins } from "../services/notify.js";
import { getSettings } from "../services/settings.js";
import { enforceSessionCap } from "../services/sessions.js";
import { credentialLimiter } from "../lib/limiter.js";
import logger from "../lib/logger.js";

export const auth = Router();

/* ============================================================
   [C5] حماية الدخول

   ثلاث مشاكل كانت قائمة وأُصلحت هنا:
   1) عدّاد `failed` لا يتلاشى أبداً → أي شخص يستطيع حجب أي حساب نهائياً
      بثلاث محاولات خاطئة. الآن يُصفَّر تلقائياً بعد نافذة هادئة.
   2) HTTP 428 مقابل 401 كان oracle لكشف الحسابات المسجلة. الآن الرمز
      موحّد 401 لكل حالات الفشل، والتمييز في body فقط.
   3) الكابتشا كانت مرتبطة بعدّاد الحساب وحده. الآن تُطلب أيضاً عند
      تجاوز حد المحاولات من نفس IP خلال النافذة — فلا يكفي تدوير الحسابات.

   كذلك: فحص `active` نُقل إلى ما بعد التحقق من كلمة المرور، حتى لا يُكشف
   وجود الحساب المعطّل لمن لا يملك كلمة مروره.
============================================================ */

const AUTH_FAIL = "البريد أو كلمة المرور غير صحيحة";

/* عدّاد محاولات على مستوى IP — ذاكرة محلية تكفي لسيرفر واحد */
const ipAttempts = new Map();
const IP_WINDOW_MS = 15 * 60_000;
const IP_CAPTCHA_AFTER = 8;

function ipFail(ip) {
  const at = Date.now();
  for (const [k, v] of ipAttempts) if (v.reset < at) ipAttempts.delete(k);
  const cur = ipAttempts.get(ip) || { n: 0, reset: at + IP_WINDOW_MS };
  cur.n += 1;
  ipAttempts.set(ip, cur);
  return cur.n;
}
function ipFailCount(ip) {
  const v = ipAttempts.get(ip);
  if (!v || v.reset < Date.now()) return 0;
  return v.n;
}
function ipFailReset(ip) {
  ipAttempts.delete(ip);
}

/** يصفّر عدّاد الحساب إن مضت نافذة التلاشي [C5] */
function decayUserFailures(u) {
  if (!u.failed) return u;
  const last = u.failed_at ? new Date(u.failed_at).getTime() : 0;
  const decayMs = config.loginFailDecayMinutes * 60_000;
  if (last && Date.now() - last > decayMs) {
    run("UPDATE users SET failed=0, failed_at=NULL, locked_until=NULL WHERE id=?", u.id);
    return { ...u, failed: 0, locked_until: null };
  }
  return u;
}

function registerFailure(u) {
  const failed = (u.failed || 0) + 1;
  const lockedUntil =
    failed >= config.loginMaxAttempts
      ? new Date(Date.now() + config.loginLockMinutes * 60_000).toISOString()
      : null;
  run(
    "UPDATE users SET failed=?, failed_at=?, locked_until=COALESCE(?,locked_until) WHERE id=?",
    failed, now(), lockedUntil, u.id,
  );
  return { failed, lockedUntil };
}

/**
 * يوحّد استجابة الفشل: 401 دائماً + captchaRequired في body فقط.
 */
function authFail(req, res, { u = null, ip = "", captchaRequired = false, reason = "bad_credentials", attempts = 0, locked = false }) {
  logEvent({
    type: u?.role === "admin" ? "admin.login_failed" : "user.login_failed",
    actorType: "system",
    actorId: u?.id || null,
    entityType: u ? "user" : null,
    entityId: u?.id || null,
    details: { reason, attempts, locked },
    ip,
  });
  return failure(res, 401, AUTH_FAIL, captchaRequired ? { captchaRequired: true } : {});
}

/** يحتاج كابتشا؟ عدّاد الحساب أو عدّاد IP */
function captchaNeeded(u, ip) {
  return (u?.failed || 0) >= config.loginCaptchaAfter || ipFailCount(ip) >= IP_CAPTCHA_AFTER;
}

/* ============================================================
   CSRF + الحالة
============================================================ */

/** [M12] تسليم توكن CSRF موقّع — في جسم الاستجابة فقط، بلا كوكي قابل للقراءة */
auth.get("/csrf", (req, res) => {
  res.json({ ok: true, csrf: issueCsrfToken(req) });
});

auth.get("/me", (req, res) => {
  const raw = req.cookies?.[config.sessionCookieName] || "";
  const s = raw ? one("SELECT * FROM sessions WHERE token_hash=?", sha256(raw)) : null;
  if (!s || new Date(s.expires_at) <= new Date()) {
    if (s) run("DELETE FROM sessions WHERE token_hash=?", s.token_hash);
    return res.json({ ok: true, user: null, csrf: issueCsrfToken(req) });
  }
  const u = one("SELECT * FROM users WHERE id=?", s.user_id);
  if (!u || !u.active) return res.json({ ok: true, user: null, csrf: issueCsrfToken(req) });
  res.json({ ok: true, user: { ...publicUser(u), unread: unreadCount(u.id) }, csrf: issueCsrfToken(req) });
});

auth.get("/captcha", (req, res) => {
  res.json({ ok: true, ...createCaptcha() });
});

/* ============================================================
   تسجيل حساب عميل
============================================================ */
auth.post("/register", credentialLimiter, asyncH(async (req, res) => {
  const r = parse(registerSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });
  const value = r.value;
  const ip = requestIp(req);

  const settings = getSettings();
  if (!settings.allowRegistration)
    return failure(res, 403, "التسجيل متوقف مؤقتاً، يرجى العودة لاحقاً");

  if (one("SELECT id FROM users WHERE email=?", value.email))
    return failure(res, 409, "هذا البريد مسجل بالفعل، يمكنك تسجيل الدخول");

  const { salt, hash, encoded } = await hashPassword(value.password);
  const id = uid("USR");
  run(
    `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'client',1,?,?)`,
    id, value.name, value.email, value.phone, encoded || hash, salt, now(), now(),
  );

  const raw = createSession(id, ip, userAgent(req));
  enforceSessionCap(id, sha256(raw));
  res.cookie(config.sessionCookieName, raw, cookieOpts(req));

  logEvent({
    type: "user.register", actorType: "client", actorId: id, actorName: value.name,
    entityType: "user", entityId: id, details: { email: value.email }, ip,
  });

  const s = getSettings();
  if (s.notifyNewUser) {
    notifyAdmins({
      type: "system", title: "عميل جديد سجل حساباً",
      body: `العميل ${value.name} (${value.email}) أنشأ حساباً جديداً`,
      entityType: "user", entityId: id, ip,
    });
  }

  const u = one("SELECT * FROM users WHERE id=?", id);
  /* [M12] التوكن يجب أن يُربط بالجلسة الجديدة، لا بحالة req القديمة */
  res.json({ ok: true, user: { ...publicUser(u), unread: 0 }, csrf: issueCsrfToken(req, raw) });
}));

/* ============================================================
   تسجيل دخول العميل
============================================================ */
auth.post("/login", credentialLimiter, asyncH(async (req, res) => {
  const r = parse(loginSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const value = r.value;
  const ip = requestIp(req);

  let u = one("SELECT * FROM users WHERE email=? AND role='client'", value.email);

  /* [C5] حساب غير موجود: نحرق نفس الزمن تقريباً ثم نفشل بنفس الرمز */
  if (!u) {
    await verifyPassword(value.password, "0".repeat(32), "0".repeat(128));
    ipFail(ip);
    return authFail(req, res, { ip, reason: "not_found", captchaRequired: captchaNeeded(null, ip) });
  }

  u = decayUserFailures(u);

  /* حظر مؤقت — نفس الرمز 401 حتى لا يُكشف الحساب */
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - new Date()) / 60000);
    logEvent({ type: "user.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { reason: "locked" }, ip });
    return failure(res, 401, `${AUTH_FAIL} — يمكنك المحاولة بعد ${arMinutes(mins)}`, { captchaRequired: true });
  }

  /* كابتشا: من عدّاد الحساب أو من عدّاد IP */
  if (captchaNeeded(u, ip)) {
    if (!value.captchaId || !verifyCaptcha(value.captchaId, value.captchaAnswer)) {
      return authFail(req, res, { u, ip, captchaRequired: true, reason: "captcha_required" });
    }
  }

  if (!(await verifyPassword(value.password, u.salt, u.pass_hash))) {
    const { failed, lockedUntil } = registerFailure(u);
    ipFail(ip);
    if (lockedUntil) {
      return failure(res, 401, `${AUTH_FAIL} — تم إيقاف المحاولات مؤقتاً، يمكنك المحاولة بعد ${arMinutes(config.loginLockMinutes)}`, { captchaRequired: true });
    }
    return authFail(req, res, { u, ip, attempts: failed, captchaRequired: captchaNeeded({ ...u, failed }, ip) });
  }

  /* [C5] فحص الإيقاف بعد نجاح كلمة المرور — لا يُكشف الحساب المعطّل إلا لصاحبه */
  if (!u.active) {
    logEvent({ type: "user.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { reason: "disabled" }, ip });
    return failure(res, 403, "تم إيقاف حسابك، يرجى التواصل معنا عبر صفحة «تواصل معنا»");
  }

  /* نجاح */
  run("UPDATE users SET failed=0, failed_at=NULL, locked_until=NULL, last_login_at=? WHERE id=?", now(), u.id);
  ipFailReset(ip);

  const raw = createSession(u.id, ip, userAgent(req));
  enforceSessionCap(u.id, sha256(raw));
  res.cookie(config.sessionCookieName, raw, cookieOpts(req));

  logEvent({ type: "user.login", actorType: "client", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip });

  const fresh = one("SELECT * FROM users WHERE id=?", u.id);
  /* [M12] التوكن يُربط بالجلسة الجديدة المُنشأة في هذا الطلب */
  res.json({ ok: true, user: { ...publicUser(fresh), unread: unreadCount(u.id) }, csrf: issueCsrfToken(req, raw) });
}));

/* ============================================================
   تسجيل دخول الأدمن
============================================================ */
auth.post("/admin/login", credentialLimiter, asyncH(async (req, res) => {
  const r = parse(loginSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const value = r.value;
  const ip = requestIp(req);

  let u = one("SELECT * FROM users WHERE email=? AND role='admin'", value.email);
  if (!u) {
    await verifyPassword(value.password, "0".repeat(32), "0".repeat(128));
    ipFail(ip);
    return authFail(req, res, { ip, reason: "not_found", captchaRequired: captchaNeeded(null, ip) });
  }

  u = decayUserFailures(u);

  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - new Date()) / 60000);
    logEvent({ type: "admin.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { reason: "locked" }, ip });
    return failure(res, 401, `${AUTH_FAIL} — يمكنك المحاولة بعد ${arMinutes(mins)}`, { captchaRequired: true });
  }

  if (captchaNeeded(u, ip)) {
    if (!value.captchaId || !verifyCaptcha(value.captchaId, value.captchaAnswer)) {
      return authFail(req, res, { u, ip, captchaRequired: true, reason: "captcha_required" });
    }
  }

  if (!(await verifyPassword(value.password, u.salt, u.pass_hash))) {
    const { failed, lockedUntil } = registerFailure(u);
    ipFail(ip);
    if (lockedUntil) {
      return failure(res, 401, `${AUTH_FAIL} — تم إيقاف المحاولات مؤقتاً، يمكنك المحاولة بعد ${arMinutes(config.loginLockMinutes)}`, { captchaRequired: true });
    }
    return authFail(req, res, { u, ip, attempts: failed, captchaRequired: captchaNeeded({ ...u, failed }, ip) });
  }

  if (!u.active) {
    logEvent({ type: "admin.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { reason: "disabled" }, ip });
    return failure(res, 403, "تم إيقاف هذا الحساب الإداري، يرجى التواصل مع مشرف آخر");
  }

  run("UPDATE users SET failed=0, failed_at=NULL, locked_until=NULL, last_login_at=? WHERE id=?", now(), u.id);
  ipFailReset(ip);

  const raw = createSession(u.id, ip, userAgent(req));
  enforceSessionCap(u.id, sha256(raw));
  res.cookie(config.sessionCookieName, raw, cookieOpts(req));

  logEvent({ type: "admin.login", actorType: "admin", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip });
  logger.info("admin login", { adminId: u.id, ip });

  const fresh = one("SELECT * FROM users WHERE id=?", u.id);
  /* [M12] التوكن يُربط بالجلسة الجديدة المُنشأة في هذا الطلب */
  res.json({ ok: true, user: publicUser(fresh), csrf: issueCsrfToken(req, raw) });
}));

/* ============================================================
   خروج — يحذف الجلسة فعلياً
============================================================ */
auth.post("/logout", (req, res) => {
  const raw = req.cookies?.[config.sessionCookieName] || "";
  const s = raw ? one("SELECT * FROM sessions WHERE token_hash=?", sha256(raw)) : null;
  if (s) {
    const u = one("SELECT * FROM users WHERE id=?", s.user_id);
    run("DELETE FROM sessions WHERE token_hash=?", s.token_hash);
    if (u) {
      logEvent({ type: "user.logout", actorType: u.role, actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
    }
  }
  res.clearCookie(config.sessionCookieName, { path: "/" });
  /* [M12] بعد الخروج لا جلسة — التوكن الجديد يجب أن يكون بمجهول */
  res.json({ ok: true, csrf: issueCsrfToken(req, CSRF_ANON) });
});

/* ============================================================
   استعادة كلمة المرور
============================================================ */
auth.post("/forgot", credentialLimiter, asyncH(async (req, res) => {
  const { value, error } = parse(forgotSchema, req.body);
  if (error) return failure(res, 422, error);
  const ip = requestIp(req);
  const u = one("SELECT * FROM users WHERE email=? AND role='client'", value.email);

  /* منع الإزعاج: طلب واحد لكل بريد خلال دقيقة */
  const last = u ? one("SELECT created_at FROM reset_tokens WHERE user_id=? ORDER BY created_at DESC LIMIT 1", u.id) : null;
  if (last && Date.now() - new Date(last.created_at) < 60_000) {
    return res.json({ ok: true, throttle: true }); // رسالة موحدة
  }

  if (u) {
    const raw = token(32);
    run(
      "INSERT INTO reset_tokens (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)",
      sha256(raw), u.id, now(), new Date(Date.now() + 3600_000).toISOString(),
    );
    const base = config.publicUrl || `http://${req.get("host")}`;
    const link = `${base}/reset-password?token=${raw}`;
    await sendMail(
      u.email,
      "إعادة تعيين كلمة المرور",
      mailTemplate(
        "إعادة تعيين كلمة المرور",
        ["طلب أحدهم إعادة تعيين كلمة مرور حسابك في منصة نَما.", "الرابط صالح لمدة ساعة واحدة، وإن لم تطلب ذلك يمكنك تجاهل هذه الرسالة."],
        { url: link, label: "إعادة تعيين كلمة المرور" },
      ),
    ).catch((e) => logger.error("reset mail failed", { message: e.message }));
    logEvent({ type: "user.password_reset_requested", actorType: "client", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip });
  }
  /* رسالة موحدة — عدم كشف وجود البريد */
  res.json({ ok: true });
}));

auth.post("/reset", credentialLimiter, asyncH(async (req, res) => {
  const { value, error } = parse(resetSchema, req.body);
  if (error) return failure(res, 422, error);
  const ip = requestIp(req);

  const row = one("SELECT * FROM reset_tokens WHERE token_hash=?", sha256(value.token));
  const invalid = () => failure(res, 400, "انتهت صلاحية رابط الاستعادة (صالح لمدة ساعة واحدة)، يرجى طلب رابط جديد");
  if (!row) return invalid();
  if (row.used_at) return invalid();
  if (new Date(row.expires_at) <= new Date()) return invalid();

  const u = one("SELECT * FROM users WHERE id=?", row.user_id);
  if (!u) return invalid();

  const { salt, hash, encoded } = await hashPassword(value.password);
  run(
    "UPDATE users SET pass_hash=?, salt=?, updated_at=?, failed=0, failed_at=NULL, locked_until=NULL WHERE id=?",
    encoded || hash, salt, now(), u.id,
  );
  run("UPDATE reset_tokens SET used_at=? WHERE token_hash=?", now(), row.token_hash);
  revokeAllSessions(u.id);
  logEvent({ type: "user.password_reset", actorType: "client", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip });
  res.json({ ok: true });
}));

/* ============================================================
   تغيير كلمة المرور الذاتي
============================================================ */
auth.post("/change-password", credentialLimiter, requireAuth, asyncH(async (req, res) => {
  const { value, error } = parse(changePasswordSchema, req.body);
  if (error) return failure(res, 422, error);
  const u = req.user;
  const ip = requestIp(req);

  if (!(await verifyPassword(value.current, u.salt, u.pass_hash)))
    return failure(res, 400, "كلمة المرور الحالية غير صحيحة");

  const { salt, hash, encoded } = await hashPassword(value.password);
  run(
    "UPDATE users SET pass_hash=?, salt=?, must_change=0, updated_at=? WHERE id=?",
    encoded || hash, salt, now(), u.id,
  );
  revokeAllSessions(u.id, req.sessionRaw);
  logEvent({ type: "user.password_changed", actorType: u.role, actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip });
  res.json({ ok: true, csrf: issueCsrfToken(req) });
}));

/* ============================================================
   بياناتي (عميل)
============================================================ */
auth.put("/profile", requireAuth, asyncH(async (req, res) => {
  if (req.user.role !== "client") return failure(res, 404, "الصفحة غير موجودة");
  const { value, error } = parse(profileSchema, req.body);
  if (error) return failure(res, 422, error, { fields: error.fields || {} });
  if (one("SELECT id FROM users WHERE email=? AND id!=?", value.email, req.user.id))
    return failure(res, 409, "هذا البريد مستخدم من قبل حساب آخر");

  run("UPDATE users SET name=?, email=?, phone=?, updated_at=? WHERE id=?",
    value.name, value.email, value.phone, now(), req.user.id);

  logEvent({
    type: "user.profile_updated", actorType: "client", actorId: req.user.id, actorName: value.name,
    entityType: "user", entityId: req.user.id, details: { fields: ["name", "email", "phone"] },
    ip: requestIp(req),
  });
  const fresh = one("SELECT * FROM users WHERE id=?", req.user.id);
  res.json({ ok: true, user: publicUser(fresh) });
}));

/* ============================================================
   سياسة الكوكيز
============================================================ */
function cookieOpts(req) {
  const cross = isCrossOriginRequest(req);
  return {
    httpOnly: true,
    sameSite: cross ? "none" : "strict",
    secure: cross ? true : config.isProd,
    path: "/",
    maxAge: config.sessionMaxMinutes * 60_000,
  };
}

/* يُستخدم في الاختبارات */
export { AUTH_FAIL, IP_CAPTCHA_AFTER, decayUserFailures, cookieOpts };
