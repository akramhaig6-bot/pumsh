import { Router } from "express";
import { run, one, now } from "../db.js";
import { uid, token, sha256, createSession, revokeAllSessions, verifyPassword, hashPassword, unreadCount } from "../lib/util.js";
import { parse, failure, asyncH, requireAuth, requestIp, setCSRFCookie } from "../lib/http.js";
import { registerSchema, loginSchema, forgotSchema, resetSchema, changePasswordSchema, profileSchema, createCaptcha, verifyCaptcha } from "../lib/validate.js";
import { sendMail } from "../lib/mailer.js";
import { config } from "../config.js";
import { isCrossOriginRequest } from "../lib/cors.js";
import { logEvent } from "../services/events.js";
import { createNotification, notifyAdmins } from "../services/notify.js";
import { getSettings } from "../services/settings.js";

export const auth = Router();

/* ---------------- CSRF ---------------- */
auth.get("/csrf", (req, res) => {
  const token = setCSRFCookie(req, res);
  res.json({ ok: true, csrf: token });
});

/* ---------------- الحالة الحالية ---------------- */
auth.get("/me", (req, res) => {
  const raw = req.cookies?.nama_sid || "";
  const s = raw ? one("SELECT * FROM sessions WHERE token_hash=?", sha256(raw)) : null;
  if (!s || new Date(s.expires_at) <= new Date()) {
    if (s) run("DELETE FROM sessions WHERE token_hash=?", s.token_hash);
    return res.json({ ok: true, user: null });
  }
  const u = one("SELECT id,name,email,phone,role,active,must_change,created_at,last_login_at FROM users WHERE id=?", s.user_id);
  res.json({ ok: true, user: u && u.active ? { ...u, unread: unreadCount(u.id) } : null });
});

/* ---------------- كابتشا للدخول ---------------- */
auth.get("/captcha", (req, res) => {
  res.json({ ok: true, ...createCaptcha() });
});

/* ---------------- تسجيل حساب عميل ---------------- */
auth.post("/register", asyncH(async (req, res) => {
  const r = parse(registerSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });
  const value = r.value;
  const settings = getSettings();
  if (!settings.allowRegistration)
    return failure(res, 403, "التسجيل مغلق حالياً من قبل الإدارة");
  if (one("SELECT id FROM users WHERE email=?", value.email))
    return failure(res, 409, "هذا البريد مسجل بالفعل، يمكنك تسجيل الدخول");
  const { salt, hash } = hashPassword(value.password);
  const id = uid("USR");
  run(
    `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'client',1,?,?)`,
    id, value.name, value.email, value.phone, hash, salt, now(), now(),
  );
  const raw = createSession(id, requestIp(req), req.headers["user-agent"]);
  res.cookie("nama_sid", raw, cookieOpts(req));
  logEvent({
    type: "user.register", actorType: "client", actorId: id, actorName: value.name,
    entityType: "user", entityId: id, entityLabel: value.email, details: { email: value.email }, ip: requestIp(req),
  });
  const s = getSettings();
  if (s.notifyNewUser) {
    notifyAdmins({
      type: "system", title: "عميل جديد سجل حساباً",
      body: `العميل ${value.name} (${value.email}) أنشأ حساباً جديداً`,
      entityType: "user", entityId: id,
    });
  }
  const u = one("SELECT id,name,email,phone,role,active,created_at FROM users WHERE id=?", id);
  res.json({ ok: true, user: { ...u, unread: 0 } });
}));

/* ---------------- تسجيل دخول العميل ---------------- */
auth.post("/login", asyncH(async (req, res) => {
  const r = parse(loginSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const value = r.value;

  const u = one("SELECT * FROM users WHERE email=? AND role='client'", value.email);
  if (!u) return failure(res, 401, "البريد أو كلمة المرور غير صحيحة");

  // حظر مؤقت
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - new Date()) / 60000);
    return failure(res, 423, `تجاوزت عدد المحاولات المسموحة، حاول بعد ${mins} دقيقة`);
  }

  // كابتشا بعد 3 محاولات فاشلة
  if (u.failed >= config.loginCaptchaAfter) {
    if (!value.captchaId || !verifyCaptcha(value.captchaId, value.captchaAnswer)) {
      return failure(res, 428, "أكمل تحدي الأمان أولاً", { captchaRequired: true });
    }
  }

  if (!u.active) {
    logEvent({ type: "user.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { reason: "disabled" }, ip: requestIp(req) });
    return failure(res, 403, "حسابك معطل، يرجى التواصل مع الإدارة");
  }

  if (!verifyPassword(value.password, u.salt, u.pass_hash)) {
    const failed = u.failed + 1;
    let lockedUntil = null;
    if (failed >= config.loginMaxAttempts) {
      lockedUntil = new Date(Date.now() + config.loginLockMinutes * 60000).toISOString();
    }
    run("UPDATE users SET failed=?, locked_until=COALESCE(?,locked_until) WHERE id=?", failed, lockedUntil, u.id);
    logEvent({
      type: "user.login_failed", actorType: "system", entityType: "user", entityId: u.id,
      details: { reason: "bad_credentials", attempts: failed, locked: !!lockedUntil }, ip: requestIp(req),
    });
    if (lockedUntil) return failure(res, 423, `تجاوزت عدد المحاولات المسموحة، حاول بعد ${config.loginLockMinutes} دقيقة`);
    if (failed >= config.loginCaptchaAfter) {
      return failure(res, 401, "البريد أو كلمة المرور غير صحيحة", { captchaRequired: true });
    }
    return failure(res, 401, "البريد أو كلمة المرور غير صحيحة");
  }

  // نجاح
  run("UPDATE users SET failed=0, locked_until=NULL, last_login_at=? WHERE id=?", now(), u.id);
  const raw = createSession(u.id, requestIp(req), req.headers["user-agent"]);
  res.cookie("nama_sid", raw, cookieOpts(req));
  logEvent({ type: "user.login", actorType: "client", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
  const fresh = one("SELECT id,name,email,phone,role,active,must_change,created_at,last_login_at FROM users WHERE id=?", u.id);
  res.json({ ok: true, user: { ...fresh, unread: unreadCount(u.id) } });
}));

/* ---------------- تسجيل دخول الأدمن ---------------- */
auth.post("/admin/login", asyncH(async (req, res) => {
  const r = parse(loginSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const value = r.value;
  const u = one("SELECT * FROM users WHERE email=? AND role='admin'", value.email);
  if (!u) {
    logEvent({ type: "admin.login_failed", actorType: "system", details: { reason: "not_found" }, ip: requestIp(req) });
    return failure(res, 401, "البريد أو كلمة المرور غير صحيحة");
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - new Date()) / 60000);
    return failure(res, 423, `تجاوزت عدد المحاولات المسموحة، حاول بعد ${mins} دقيقة`);
  }
  if (u.failed >= config.loginCaptchaAfter) {
    if (!value.captchaId || !verifyCaptcha(value.captchaId, value.captchaAnswer)) {
      return failure(res, 428, "أكمل تحدي الأمان أولاً", { captchaRequired: true });
    }
  }
  if (!u.active) {
    logEvent({ type: "admin.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { reason: "disabled" }, ip: requestIp(req) });
    return failure(res, 403, "الحساب معطل، يرجى التواصل مع أدمن نشط");
  }
  if (!verifyPassword(value.password, u.salt, u.pass_hash)) {
    const failed = u.failed + 1;
    let lockedUntil = null;
    if (failed >= config.loginMaxAttempts)
      lockedUntil = new Date(Date.now() + config.loginLockMinutes * 60000).toISOString();
    run("UPDATE users SET failed=?, locked_until=COALESCE(?,locked_until) WHERE id=?", failed, lockedUntil, u.id);
    logEvent({ type: "admin.login_failed", actorType: "system", entityType: "user", entityId: u.id, details: { attempts: failed, locked: !!lockedUntil }, ip: requestIp(req) });
    if (lockedUntil) return failure(res, 423, `تجاوزت العدد المسموح، حاول بعد ${config.loginLockMinutes} دقيقة`);
    if (failed >= config.loginCaptchaAfter) return failure(res, 401, "البريد أو كلمة المرور غير صحيحة", { captchaRequired: true });
    return failure(res, 401, "البريد أو كلمة المرور غير صحيحة");
  }
  run("UPDATE users SET failed=0, locked_until=NULL, last_login_at=? WHERE id=?", now(), u.id);
  const raw = createSession(u.id, requestIp(req), req.headers["user-agent"]);
  res.cookie("nama_sid", raw, cookieOpts(req));
  logEvent({ type: "admin.login", actorType: "admin", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
  res.json({ ok: true, user: one("SELECT id,name,email,role,active,must_change,created_at,last_login_at FROM users WHERE id=?", u.id) });
}));

/* ---------------- خروج ---------------- */
auth.post("/logout", (req, res) => {
  const raw = req.cookies?.nama_sid || "";
  const s = raw ? one("SELECT * FROM sessions WHERE token_hash=?", sha256(raw)) : null;
  if (s) {
    const u = one("SELECT * FROM users WHERE id=?", s.user_id);
    run("DELETE FROM sessions WHERE token_hash=?", s.token_hash);
    if (u) logEvent({ type: "user.logout", actorType: u.role, actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
  }
  res.clearCookie("nama_sid", { path: "/" });
  res.json({ ok: true });
});

/* ---------------- استعادة كلمة المرور ---------------- */
auth.post("/forgot", asyncH(async (req, res) => {
  const { value, error } = parse(forgotSchema, req.body);
  if (error) return failure(res, 422, error);
  const u = one("SELECT * FROM users WHERE email=? AND role='client'", value.email);

  // منع الإزعاج: طلب واحد لكل بريد خلال دقيقة
  const last = u
    ? one("SELECT created_at FROM reset_tokens WHERE user_id=? ORDER BY created_at DESC LIMIT 1", u.id)
    : null;
  if (last && Date.now() - new Date(last.created_at) < 60_000) {
    return res.json({ ok: true, throttle: true }); // رسالة موحدة
  }

  if (u) {
    const raw = token(32);
    run(
      `INSERT INTO reset_tokens (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)`,
      sha256(raw), u.id, now(), new Date(Date.now() + 3600_000).toISOString(),
    );
    const link = `${config.publicUrl}/reset-password?token=${raw}`;
    await sendMail(
      u.email,
      "إعادة تعيين كلمة المرور",
      `اضغط على الرابط لإعادة تعيين كلمة المرور (صالح ساعة واحدة):<br/><a href="${link}">${link}</a>`,
    ).catch((e) => console.error("[mail]", e.message));
    logEvent({ type: "user.password_reset_requested", actorType: "client", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
  }
  // رسالة موحدة — عدم كشف وجود البريد
  res.json({ ok: true });
}));

auth.post("/reset", asyncH(async (req, res) => {
  const { value, error } = parse(resetSchema, req.body);
  if (error) return failure(res, 422, error);
  const row = one("SELECT * FROM reset_tokens WHERE token_hash=?", sha256(value.token));
  const invalid = () => failure(res, 400, "الرابط غير صالح أو منتهي الصلاحية");
  if (!row) return invalid();
  if (row.used_at) return invalid();
  if (new Date(row.expires_at) <= new Date()) return invalid();
  const u = one("SELECT * FROM users WHERE id=?", row.user_id);
  if (!u) return invalid();
  const { salt, hash } = hashPassword(value.password);
  run("UPDATE users SET pass_hash=?, salt=?, updated_at=?, failed=0, locked_until=NULL WHERE id=?", hash, salt, now(), u.id);
  run("UPDATE reset_tokens SET used_at=? WHERE token_hash=?", now(), row.token_hash);
  revokeAllSessions(u.id);
  logEvent({ type: "user.password_reset", actorType: "client", actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
  res.json({ ok: true });
}));

/* ---------------- تغيير كلمة المرور الذاتي ---------------- */
auth.post("/change-password", requireAuth, asyncH(async (req, res) => {
  const { value, error } = parse(changePasswordSchema, req.body);
  if (error) return failure(res, 422, error);
  const u = req.user;
  if (!verifyPassword(value.current, u.salt, u.pass_hash))
    return failure(res, 400, "كلمة المرور الحالية غير صحيحة");
  const { salt, hash } = hashPassword(value.password);
  run("UPDATE users SET pass_hash=?, salt=?, must_change=0, updated_at=? WHERE id=?", hash, salt, now(), u.id);
  revokeAllSessions(u.id, req.sessionRaw);
  logEvent({ type: "user.password_changed", actorType: u.role, actorId: u.id, actorName: u.name, entityType: "user", entityId: u.id, ip: requestIp(req) });
  res.json({ ok: true });
}));

/* ---------------- بياناتي (عميل) ---------------- */
auth.put("/profile", requireAuth, asyncH(async (req, res) => {
  if (req.user.role !== "client") return failure(res, 404, "الصفحة غير موجودة");
  const { value, error } = parse(profileSchema, req.body);
  if (error) return failure(res, 422, error, { fields: {} });
  if (one("SELECT id FROM users WHERE email=? AND id!=?", value.email, req.user.id))
    return failure(res, 409, "هذا البريد مستخدم من قبل حساب آخر");
  run("UPDATE users SET name=?, email=?, phone=?, updated_at=? WHERE id=?", value.name, value.email, value.phone, now(), req.user.id);
  logEvent({
    type: "user.profile_updated", actorType: "client", actorId: req.user.id, actorName: value.name,
    entityType: "user", entityId: req.user.id,
    details: { fields: ["name", "email", "phone"] }, ip: requestIp(req),
  });
  res.json({ ok: true, user: one("SELECT id,name,email,phone,role,active,created_at,last_login_at FROM users WHERE id=?", req.user.id) });
}));

function cookieOpts(req) {
  const cross = isCrossOriginRequest(req);
  return {
    httpOnly: true,
    sameSite: cross ? "none" : "strict",
    secure: cross ? true : config.env === "production",
    path: "/",
    maxAge: config.sessionMaxMinutes * 60_000,
  };
}
