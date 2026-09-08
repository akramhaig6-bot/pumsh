import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.jsx";
import { useApp } from "../store.jsx";
import { Field, Spinner } from "../components/ui.jsx";

const shell = (title, sub, children) => (
  <div className="wrap" style={{ maxWidth: 460, padding: "3rem 1rem 4rem" }}>
    <div className="card">
      <div className="center" style={{ marginBottom: "1.2rem" }}>
        <h1 style={{ marginBottom: ".1em" }}>{title}</h1>
        <p className="muted small" style={{ margin: 0 }}>{sub}</p>
      </div>
      {children}
    </div>
  </div>
);

export function Login() {
  const { setAuth, toast } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/account";
  const [f, setF] = useState({ email: "", password: "" });
  const [captcha, setCaptcha] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const needCaptcha = () => {
    api("/api/auth/captcha").then((d) => setCaptcha(d)).catch(() => {});
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const d = await api("/api/auth/login", {
        method: "POST",
        body: { ...f, captchaId: captcha?.id, captchaAnswer: f.captchaAnswer },
      });
      setAuth(d.user);
      toast(`مرحباً ${d.user.name}`);
      nav(d.user.role === "admin" ? "/admin" : next, { replace: true });
    } catch (e2) {
      setErr(e2.message);
      if (e2.data?.captchaRequired) needCaptcha();
    }
    setBusy(false);
  };

  return shell("تسجيل الدخول", "أهلاً بعودتك — تابع طلباتك من مكان واحد",
    <>
      {err && <div className="alert err">{err}</div>}
      <form onSubmit={submit}>
        <Field label="البريد الإلكتروني" req>
          <input dir="ltr" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="كلمة المرور" req>
          <input dir="ltr" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        {captcha && (
          <Field label={`تحدي الأمان: ${captcha.question}`} req>
            <input dir="ltr" inputMode="numeric" value={f.captchaAnswer || ""} onChange={(e) => setF({ ...f, captchaAnswer: e.target.value })} />
          </Field>
        )}
        <button className="btn lg block" disabled={busy}>{busy ? "جارٍ..." : "دخول"}</button>
      </form>
      <div className="flex between" style={{ marginTop: "1rem" }}>
        <Link className="small" to="/forgot">نسيت كلمة المرور؟</Link>
        <Link className="small" to="/register">حساب جديد</Link>
      </div>
    </>,
  );
}

export function AdminLogin() {
  const { setAuth, toast } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [captcha, setCaptcha] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const d = await api("/api/auth/admin/login", {
        method: "POST",
        body: { ...f, captchaId: captcha?.id, captchaAnswer: f.captchaAnswer },
      });
      setAuth(d.user);
      toast(`مرحباً ${d.user.name}`);
      nav("/admin", { replace: true });
    } catch (e2) {
      setErr(e2.message);
      if (e2.data?.captchaRequired) api("/api/auth/captcha").then((d) => setCaptcha(d));
    }
    setBusy(false);
  };

  return shell("بوابة الإدارة", "المنطقة مخصصة لمشرفي المنصة فقط",
    <>
      {err && <div className="alert err">{err}</div>}
      <form onSubmit={submit}>
        <Field label="بريد المشرف" req><input dir="ltr" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="كلمة المرور" req><input dir="ltr" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {captcha && (
          <Field label={`تحدي الأمان: ${captcha.question}`} req>
            <input dir="ltr" inputMode="numeric" value={f.captchaAnswer || ""} onChange={(e) => setF({ ...f, captchaAnswer: e.target.value })} />
          </Field>
        )}
        <button className="btn lg block" disabled={busy}>{busy ? "جارٍ..." : "دخول"}</button>
      </form>
      <div className="center mt1"><Link className="small" to="/login">← عودة لصفحة العميل</Link></div>
    </>,
  );
}

export function Register() {
  const { setAuth, toast } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/account";
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", confirm: "", terms: false });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  const err = async (e) => {
    try {
      const d = await api("/api/auth/register", { method: "POST", body: f });
      setAuth(d.user);
      toast("تم إنشاء حسابك بنجاح");
      nav(next, { replace: true });
    } catch (e2) {
      setErrs(e2.data?.fields || {});
      alert(e2.message + (e2.data?.fields ? " — راجع الحقول المميزة" : ""));
    }
    setBusy(false);
  };

  return shell("إنشاء حساب جديد", "سجّل لتقديم الطلبات ومتابعتها أولاً بأول",
    <>
      <form onSubmit={(e) => { e.preventDefault(); setBusy(true); err(); }}>
        <Field label="الاسم الكامل" req error={errs.name}>
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="البريد الإلكتروني" req error={errs.email}>
          <input dir="ltr" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="رقم الجوال" req error={errs.phone}>
          <input dir="ltr" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+9677xxxxxxxx" />
        </Field>
        <div className="row2">
          <Field label="كلمة المرور" req error={errs.password}>
            <input dir="ltr" type="password" required value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label="تأكيد كلمة المرور" req error={errs.confirm}>
            <input dir="ltr" type="password" required value={f.confirm}
              onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
        </div>
        <div className="hint" style={{ marginBottom: ".7em" }}>8 أحرف على الأقل مع حرف صغير وكبير ورقم</div>
        <label className="check" style={{ marginBottom: "1rem" }}>
          <input type="checkbox" required checked={f.terms}
            onChange={(e) => setF({ ...f, terms: e.target.checked })} />
          أوافق على الشروط والأحكام وسياسة الخصوصية
        </label>
        <button className="btn lg block" disabled={busy}>{busy ? "جارٍ..." : "إنشاء الحساب"}</button>
      </form>
      <div className="center mt1"><Link className="small" to="/login">لديك حساب؟ سجّل الدخول</Link></div>
    </>,
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api("/api/auth/forgot", { method: "POST", body: { email } }); setDone(true); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return shell("استعادة كلمة المرور", "سنرسل لك رابط إعادة التعيين عبر البريد",
    done ? <div className="alert ok center">إذا كان البريد مسجلاً، أرسلنا لك رابط إعادة التعيين خلال دقائق. يرجى فحص بريدك.</div>
    : (
      <form onSubmit={submit}>
        <Field label="بريدك الإلكتروني" req>
          <input dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button className="btn lg block" disabled={busy}>{busy ? "جارٍ..." : "إرسال الرابط"}</button>
      </form>
    ),
  );
}

export function Reset() {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const [f, setF] = useState({ password: "", confirm: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api("/api/auth/reset", { method: "POST", body: { token, ...f } });
      setDone(true);
      setTimeout(() => nav("/login"), 1600);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  return shell("تعيين كلمة مرور جديدة", "ستحتاج إلى تسجيل الدخول مرة أخرى بعد التغيير",
    done ? <div className="alert ok center">تم تغيير كلمة المرور بنجاح — جارٍ التحويل للدخول...</div>
    : (
      <>
        {!token && <div className="alert err">رابط غير صالح — اطلب رابطاً جديداً من صفحة الاستعادة.</div>}
        {err && <div className="alert err">{err}</div>}
        <form onSubmit={submit}>
          <Field label="كلمة المرور الجديدة" req>
            <input dir="ltr" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label="التأكيد" req>
            <input dir="ltr" type="password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
          <button className="btn lg block" disabled={busy || !token}>{busy ? "جارٍ..." : "تغيير كلمة المرور"}</button>
        </form>
      </>
    ),
  );
}
