import { useEffect, useState } from "react";
import { api, qs, fmtDate, absUrl } from "../../lib/api.jsx";
import { Spinner, Empty, Badge, Pager, Modal, Confirm, Field } from "../../components/ui.jsx";
import { PageHead } from "../../components/shell.jsx";
import { useApp } from "../../store.jsx";

/* =================== الإعدادات =================== */
export function Settings() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [tab, setTab] = useState("general");
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api("/api/cms/settings"), api("/api/cms/settings/changes")])
    .then(([s, c]) => { setD(s.settings); setF(s.settings); setChanges(c.changes); })
    .catch((e) => alert(e.message));
  const [changes, setChanges] = useState([]);
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try { const r = await api("/api/cms/settings", { method: "PUT", body: f }); toast("حُفظت الإعدادات — طبّقت على الموقع مباشرة"); setF(r.settings); load(); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  if (!f) return <Spinner />;
  const set = (k, v) => setF({ ...f, [k]: v });

  return (
    <>
      <PageHead title="إعدادات المنصة" sub="كل إعدادات الموقع تدار من هنا — بدون أي ملفات إعداد خارجية"
        actions={<button className="btn" onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</button>} />
      <div className="grid" style={{ gridTemplateColumns: "220px 1fr" }}>
        <div className="card pad0" style={{ alignSelf: "start", padding: ".5rem" }}>
          {[["general", "عام"], ["brand", "الهوية البصرية"], ["catalog", "العروض والطلبات"], ["home", "أقسام الرئيسية"], ["maintenance", "وضع الصيانة"], ["history", "سجل التغييرات"]].map(([k, l]) => (
            <button key={k} className={`btn ${tab === k ? "ghost" : "secondary"} sm`}
              onClick={() => setTab(k)} style={{ width: "100%", justifyContent: "flex-start", marginBottom: ".3em" }}>{l}</button>
          ))}
        </div>
        <div className="card">
          {tab === "general" && (
            <>
              <div className="row2">
                <Field label="اسم المنصة" req><input value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="الشعار النصي (tagline)"><input value={f.tagline || ""} onChange={(e) => set("tagline", e.target.value)} /></Field>
              </div>
              <Field label="الوصف (يظهر أسفل الموقع وفي نتائج البحث)"><textarea rows={2} value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></Field>
              <div className="row2">
                <Field label="البريد الرسمي"><input dir="ltr" value={f.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field label="الهاتف"><input dir="ltr" value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
              </div>
              <Field label="العنوان"><input value={f.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="نص الحقوق"><input value={f.copyright || ""} onChange={(e) => set("copyright", e.target.value)} placeholder="© {year} جميع الحقوق محفوظة." /></Field>
              <div className="row2">
                <Field label="رابط فيسبوك"><input dir="ltr" value={f.socials?.[0]?.url || ""} onChange={(e) => set("socials", [{ ...(f.socials?.[0] || { type: "facebook" }), type: "facebook", url: e.target.value }])} /></Field>
                <Field label="رابط إنستغرام"><input dir="ltr" value={f.socials?.[1]?.url || ""} onChange={(e) => set("socials", [{ ...(f.socials?.[0] || { type: "facebook" }) }, { type: "instagram", url: e.target.value }])} /></Field>
              </div>
              <Field label="رقم واتساب"><input dir="ltr" value={f.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></Field>
            </>
          )}
          {tab === "brand" && (
            <>
              <Field label="شعار (رابط صورة)"><input dir="ltr" value={f.logo || ""} onChange={(e) => set("logo", e.target.value)} placeholder="/api/up/..." /></Field>
              <Field label="أيقونة الموقع (favicon)"><input dir="ltr" value={f.favicon || ""} onChange={(e) => set("favicon", e.target.value)} /></Field>
              <div className="grid cols2 mt1">
                {f.logo && <img src={absUrl(f.logo)} alt="الشعار" style={{ maxHeight: 80 }} />}
                {f.favicon && <img src={absUrl(f.favicon)} alt="الأيقونة" style={{ maxHeight: 64 }} />}
              </div>
            </>
          )}
          {tab === "catalog" && (
            <>
              <div className="row2">
                <Field label="الحد الأقصى لرفع الملف (MB)"><input type="number" min={1} max={100} value={f.maxFileMB || 5} onChange={(e) => set("maxFileMB", Number(e.target.value))} /></Field>
                <Field label="عروض مميزة بالرئيسية"><input type="number" min={1} max={48} value={f.featuredCount || 6} onChange={(e) => set("featuredCount", Number(e.target.value))} /></Field>
              </div>
              <div className="row2">
                <Field label="مقالات بالرئيسية"><input type="number" min={0} max={24} value={f.articleCount || 3} onChange={(e) => set("articleCount", Number(e.target.value))} /></Field>
                <Field label="عدد النتائج بالصفحة"><input type="number" min={4} max={50} value={f.pageSize || 12} onChange={(e) => set("pageSize", Number(e.target.value))} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={!!f.allowRegistration} onChange={(e) => set("allowRegistration", e.target.checked)} /> فتح التسجيل للعملاء الجدد</label>
              <label className="check" style={{ marginTop: ".5em" }}><input type="checkbox" checked={!!f.notifyNewUser} onChange={(e) => set("notifyNewUser", e.target.checked)} /> إشعار الإدارة عند تسجيل عميل جديد</label>
              <div className="alert info small mt1">الحد الأقصى للملف يطبق أيضاً على مرفقات الطلبات والتذاكر والوسائط.</div>
            </>
          )}
          {tab === "home" && (
            <>
              <Field label="أقسام الصفحة الرئيسية" hint="أطفئ أي قسم لإخفائه فوراً من الواجهة">
                <div className="grid" style={{ gap: ".5em" }}>
                  {(f.homeSections || []).map((s, i) => (
                    <label className="check card" key={s.id} style={{ padding: ".6em 1em" }}>
                      <input type="checkbox" checked={!!s.enabled} onChange={(e) => {
                        const arr = [...(f.homeSections || [])];
                        arr[i] = { ...s, enabled: e.target.checked };
                        set("homeSections", arr);
                      }} />
                      <span style={{ fontWeight: 600 }}>{s.label || s.id}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}
          {tab === "maintenance" && (
            <>
              <label className="check"><input type="checkbox" checked={!!f.maintenance} onChange={(e) => set("maintenance", e.target.checked)} /> تفعيل وضع الصيانة (تُخفى الواجهة عن الزوار ويتولى العميلون نظامهم المعتاد)</label>
              {f.maintenance && (
                <>
                  <Field label="العنوان"><input value={f.maintenanceTitle || ""} onChange={(e) => set("maintenanceTitle", e.target.value)} /></Field>
                  <Field label="الرسالة"><textarea rows={3} value={f.maintenanceMessage || ""} onChange={(e) => set("maintenanceMessage", e.target.value)} /></Field>
                  <Field label="تاريخ العودة المتوقع"><input type="date" value={(f.returnDate || "").slice(0, 10)} onChange={(e) => set("returnDate", e.target.value)} /></Field>
                </>
              )}
            </>
          )}
          {tab === "history" && (
            <>
              <h3>سجل تعديلات الإعدادات</h3>
              {changes?.length ? changes.map((c) => (
                <div key={c.id} className="list-row">
                  <div style={{ flex: 1 }}>
                    <b>{c.admin_name}</b> <span className="small muted">· {fmtDate(c.created_at)}</span>
                    <div className="s">{c.changes?.map((x) => x.key).join("، ") || "تعديل"}</div>
                  </div>
                </div>
              )) : <Empty icon="🕘" title="لا تغييرات بعد" />}
            </>
          )}
        </div>
      </div>
      <style>{`@media(max-width:900px){ .grid[style]{grid-template-columns:1fr !important;} }`}</style>
    </>
  );
}

/* =================== الإشعارات =================== */
export function Notifications() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState("all");
  const load = (p = page) => { setD(null); api(`/api/admin/notifications${qs({ page: p, per: 20, scope })}`).then(setD).catch((e) => alert(e.message)); };
  useEffect(() => { load(page); }, [page, scope]);
  const retry = async (id) => {
    try { await api(`/api/admin/notifications/${id}/retry`, { method: "POST" }); toast("أُعيد إرسال الإشعار"); load(page); }
    catch (e2) { alert(e2.message); }
  };
  return (
    <>
      <PageHead title="الإشعارات" sub="كل إشعارات النظام، مع إعادة إرسال الفاشلة"
        actions={
          <select value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }}>
            <option value="all">الكل</option><option value="me">إشعاراتي</option>
          </select>
        } />
      <div className="card pad0">
        <table>
          <thead><tr><th>المستلم</th><th>العنوان</th><th>الحالة</th><th>الوقت</th><th></th></tr></thead>
          <tbody>
            {!d ? <tr><td colSpan={5}><Spinner /></td></tr> : d.notifications?.length ? d.notifications.map((n) => (
              <tr key={n.id}>
                <td className="small mono">{n.user_id}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{n.title}</div>
                  <div className="small muted">{n.body.slice(0, 90)}</div>
                </td>
                <td><Badge map={{ sent: { label: "مُرسل", color: "green" }, failed: { label: "فشل", color: "red" } }} value={n.status} />
                  {n.read ? <span className="chip">مقروء</span> : <span className="chip">غير مقروء</span>}
                </td>
                <td className="small">{fmtDate(n.created_at)}</td>
                <td>{n.status !== "sent" && <button className="btn sm secondary" onClick={() => retry(n.id)}>إعادة</button>}</td>
              </tr>
            )) : <tr><td colSpan={5}><Empty icon="🔔" title="لا إشعارات" /></td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>
    </>
  );
}

/* =================== سجل الأحداث =================== */
export function Events() {
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [view, setView] = useState(null);
  const load = (p = page) => { setD(null); api(`/api/admin/events${qs({ page: p, q, type })}`).then(setD).catch((e) => alert(e.message)); };
  useEffect(() => { load(page); }, [page, q, type]);
  return (
    <>
      <PageHead title="سجل الأحداث" sub="أثر تدقيق كامل لكل إجراء على المنصة"
        actions={<>
          <input placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">كل الأنواع</option>
            {["request.transition", "ticket.transition", "offer.publish", "article.create", "user.login", "user.register", "settings.change"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <a className="btn secondary sm" href="/api/admin/events/export.csv" target="_blank" rel="noreferrer">⬇ CSV</a>
        </>} />
      <div className="card pad0">
        <table>
          <thead><tr><th>النوع</th><th>الفاعل</th><th>الكيان</th><th>التفاصيل</th><th>الوقت</th></tr></thead>
          <tbody>
            {!d ? <tr><td colSpan={5}><Spinner /></td></tr> : d.events?.length ? d.events.map((e) => (
              <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => setView(e)}>
                <td><span className="chip mono">{e.type}</span></td>
                <td className="small">{e.actor_name}</td>
                <td className="small">{e.entity_type || "—"} {e.entity_id && <span className="mono">#{e.entity_id}</span>}</td>
                <td className="small muted">{e.entity_label || ""}</td>
                <td className="small">{fmtDate(e.created_at)}</td>
              </tr>
            )) : <tr><td colSpan={5}><Empty icon="🕵️" title="لا أحداث" /></td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>
      {view && (
        <Modal title={`حدث: ${view.type}`} onClose={() => setView(null)}>
          <p className="small"><b>الفاعل:</b> {view.actor_name} ({view.actor_type})</p>
          <p className="small"><b>الكيان:</b> {view.entity_type} {view.entity_id && <span className="mono">#{view.entity_id}</span>}</p>
          <p className="small"><b>الوقت:</b> {fmtDate(view.created_at)} {view.ip && <span className="mono"> · {view.ip}</span>}</p>
          <pre style={{ background: "var(--surface2)", padding: "1em", borderRadius: 8, overflow: "auto", fontSize: ".8rem" }}>{JSON.stringify(view.details, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}

/* =================== المشرفون =================== */
export function Admins() {
  const { user, toast } = useApp();
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [temp, setTemp] = useState({ temp: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/admin/admins").then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api("/api/admin/admins", { method: "POST", body: editing });
      toast(`أُنشئ المشرف — كلمة المرور المؤقتة: ${r.temporary}`);
      setEditing(null); load();
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const toggle = async (a) => {
    if (!confirm(`ت${a.active ? "عطيل" : "فعيل"} حساب ${a.name}؟`)) return;
    try { await api(`/api/admin/admins/${a.id}/toggle`, { method: "POST", body: { active: !a.active } }); toast("تم"); load(); }
    catch (e2) { alert(e2.message); }
  };
  const reset = async () => {
    setBusy(true);
    try { await api(`/api/admin/admins/${resetFor.id}/reset`, { method: "POST", body: temp }); toast("أُعيد تعيين كلمة المرور"); setResetFor(null); setTemp({ temp: "", confirm: "" }); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="المشرفون" sub="كل من يدير المنصة — بأدنى صلاحية أو بأعلاها بحسب الحساب"
        actions={<button className="btn" onClick={() => setEditing({ name: "", email: "", password: "", confirm: "" })}>+ مشرف جديد</button>} />
      <div className="card pad0">
        <table>
          <thead><tr><th>المشرف</th><th>البريد</th><th>الحالة</th><th>آخر دخول</th><th>إجراءات</th></tr></thead>
          <tbody>
            {!d ? <tr><td colSpan={5}><Spinner /></td></tr> : d.admins?.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 700 }}>{a.name} {a.id === user.id && <span className="chip">أنت</span>}</td>
                <td className="mono small">{a.email}</td>
                <td>
                  {a.active ? <Badge map={{ on: { label: "نشط", color: "green" } }} value="on" /> : <Badge map={{ off: { label: "معطل", color: "red" } }} value="off" />}
                  {a.must_change ? <span className="chip">يجب تغيير كلمة المرور</span> : null}
                </td>
                <td className="small">{fmtDate(a.last_login_at)}</td>
                <td>
                  <div className="flex">
                    <button className="btn sm secondary" onClick={() => setResetFor(a)}>كلمة مرور</button>
                    {a.id !== user.id && <button className="btn sm danger-soft" onClick={() => toggle(a)}>{a.active ? "تعطيل" : "تفعيل"}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title="مشرف جديد" onClose={() => setEditing(null)}
          foot={<><button className="btn secondary" onClick={() => setEditing(null)}>إلغاء</button><button className="btn" form="adm-form" disabled={busy}>إنشاء</button></>}>
          <form id="adm-form" onSubmit={create}>
            <Field label="الاسم" req><input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="البريد" req><input dir="ltr" type="email" required value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <div className="row2">
              <Field label="كلمة مرور مؤقتة" req><input dir="ltr" required value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></Field>
              <Field label="تأكيد" req><input dir="ltr" required value={editing.confirm} onChange={(e) => setEditing({ ...editing, confirm: e.target.value })} /></Field>
            </div>
          </form>
        </Modal>
      )}
      {resetFor && (
        <Modal title={`إعادة تعيين كلمة مرور — ${resetFor.name}`} onClose={() => setResetFor(null)}
          foot={<><button className="btn secondary" onClick={() => setResetFor(null)}>إلغاء</button><button className="btn" onClick={reset} disabled={busy}>حفظ</button></>}>
          <Field label="كلمة مرور مؤقتة" req><input dir="ltr" value={temp.temp} onChange={(e) => setTemp({ ...temp, temp: e.target.value })} /></Field>
          <Field label="تأكيد" req><input dir="ltr" value={temp.confirm} onChange={(e) => setTemp({ ...temp, confirm: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}

/* =================== ملفي (مشرف) =================== */
export function Me() {
  const { user, toast, setAuth } = useApp();
  const [f, setF] = useState({ name: user?.name || "", email: user?.email || "" });
  const [pw, setPw] = useState({ current: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api("/api/admin/me/profile", { method: "PUT", body: f }); setAuth({ ...user, ...f }); toast("حُفظ ملفك"); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const change = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api("/api/auth/change-password", { method: "POST", body: pw }); toast("غيّرت كلمة مرورك — سجّل الدخول مجدداً"); setPw({ current: "", password: "", confirm: "" }); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="ملفي الشخصي" sub="بيانات حسابك الإداري" />
      <div className="grid cols2">
        <form className="card" onSubmit={save}>
          <h3>بيانات الحساب</h3>
          <Field label="الاسم" req><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="البريد" req><input dir="ltr" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <button className="btn block" disabled={busy}>حفظ</button>
        </form>
        <form className="card" onSubmit={change}>
          <h3>تغيير كلمة المرور</h3>
          <Field label="الحالية" req><input dir="ltr" type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="الجديدة" req><input dir="ltr" type="password" required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
          <Field label="تأكيد" req><input dir="ltr" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <button className="btn block" disabled={busy}>تغيير</button>
        </form>
      </div>
    </>
  );
}
