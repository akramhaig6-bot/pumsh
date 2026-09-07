import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, qs, fmtDate, REQUEST_STATUSES, TICKET_STATUSES } from "../lib/api.jsx";
import { Spinner, Empty, Badge, Pager, Tabs, Field, FileChips, Modal, Confirm } from "../components/ui.jsx";
import { useApp } from "../store.jsx";

/* =================== نظرة عامة =================== */
export function Overview() {
  const { user, unread } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => {
    Promise.all([api("/api/client/requests?per=3"), api("/api/client/tickets?per=3")])
      .then(([r, t]) => setD({ requests: r.requests, tickets: t.tickets }))
      .catch(() => {});
  }, []);
  return (
    <div className="grid cols2">
      <div className="card">
        <h3>مرحباً، {user?.name} 👋</h3>
        <p className="muted small">تابع طلباتك وتذاكر الدعم من هنا. لديك <b>{unread}</b> إشعار غير مقروء.</p>
        <div className="flex">
          <Link className="btn" to="/offers">تصفح العروض</Link>
          <Link className="btn secondary" to="/account/tickets">فتح تذكرة دعم</Link>
        </div>
      </div>
      <div className="card">
        <h3>أحدث الطلبات</h3>
        {d && d.requests?.length ? d.requests.map((r) => (
          <Link key={r.id} to={`/account/requests/${r.id}`} className="list-row">
            <div>
              <div className="t">{r.offer_title}</div>
              <div className="s mono">#{r.id}</div>
            </div>
            <Badge map={REQUEST_STATUSES} value={r.status} />
          </Link>
        )) : <Empty icon="📋" title="لا طلبات بعد" sub="ابدأ بتصفح العروض" />}
      </div>
      <div className="card">
        <h3>تذاكر الدعم</h3>
        {d && d.tickets?.length ? d.tickets.map((t) => (
          <Link key={t.id} to={`/account/tickets/${t.id}`} className="list-row">
            <div>
              <div className="t">{t.subject}</div>
              <div className="s">آخر تحديث: {fmtDate(t.updated_at)}</div>
            </div>
            <Badge map={TICKET_STATUSES} value={t.status} />
          </Link>
        )) : <Empty icon="🎧" title="لا تذاكر" />}
      </div>
    </div>
  );
}

/* =================== الملف الشخصي =================== */
export function Profile() {
  const { user, toast, setAuth } = useApp();
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [pw, setPw] = useState({ current: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) setF({ name: user.name, email: user.email, phone: user.phone || "" }); }, [user]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const d = await api("/api/auth/profile", { method: "PUT", body: f }); setAuth({ ...user, ...d.user }); toast("تم حفظ بياناتك"); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const change = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api("/api/auth/change-password", { method: "POST", body: pw }); toast("تم تغيير كلمة المرور"); setPw({ current: "", password: "", confirm: "" }); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <div className="grid cols2">
      <form className="card" onSubmit={save}>
        <h3>بياناتي</h3>
        <Field label="الاسم الكامل" req><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="البريد الإلكتروني" req><input dir="ltr" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="رقم الجوال" req><input dir="ltr" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <button className="btn block" disabled={busy}>حفظ البيانات</button>
      </form>
      <form className="card" onSubmit={change}>
        <h3>تغيير كلمة المرور</h3>
        <Field label="كلمة المرور الحالية" req><input dir="ltr" type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="الجديدة (8+ أحرف، صغير/كبير/رقم)" req><input dir="ltr" type="password" required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
        <Field label="تأكيد الجديدة" req><input dir="ltr" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        <button className="btn block" disabled={busy}>تغيير كلمة المرور</button>
      </form>
    </div>
  );
}

/* =================== الطلبات =================== */
export function Requests() {
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("all");
  useEffect(() => {
    setD(null);
    api(`/api/client/requests${qs({ page, status: tab === "all" ? "" : tab })}`).then(setD).catch(() => {});
  }, [page, tab]);
  const tabs = [{ k: "all", label: "الكل" }, ...Object.entries(REQUEST_STATUSES).map(([k, v]) => ({ k, label: v.label }))];
  return (
    <div className="card pad0">
      <div className="card-head"><h3>طلباتي</h3><Link className="btn sm" to="/offers">+ طلب جديد</Link></div>
      <div style={{ padding: "0 .6rem" }}><Tabs items={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} /></div>
      {!d ? <Spinner /> : d.requests?.length ? (
        <div>
          {d.requests.map((r) => (
            <Link key={r.id} to={`/account/requests/${r.id}`} className="list-row">
              <div>
                <div className="t">{r.offer_title}</div>
                <div className="s mono">#{r.id} · {fmtDate(r.created_at)}</div>
              </div>
              <Badge map={REQUEST_STATUSES} value={r.status} />
            </Link>
          ))}
        </div>
      ) : <Empty icon="📋" title="لا توجد طلبات بهذه الحالة" />}
      <div style={{ padding: "0 1rem 1rem" }}>
        <Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} />
      </div>
    </div>
  );
}

/* =================== تفاصيل طلب + إجراءات العميل =================== */
export function RequestDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [info, setInfo] = useState({ reply: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = () => api(`/api/client/requests/${id}`).then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, [id]);

  const sendInfo = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("reply", info.reply);
    for (const f of files) fd.append("files", f);
    setBusy(true);
    try { await api(`/api/client/requests/${id}/info`, { method: "POST", form: fd }); toast("أرسلت المعلومات المطلوبة"); setInfo({ reply: "" }); setFiles([]); load(); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false);
  };

  const cancel = async () => {
    setBusy(true);
    try { await api(`/api/client/requests/${id}/cancel`, { method: "POST", body: { reason: "ألغى العميل الطلب" } }); toast("تم إلغاء الطلب"); load(); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false); setConfirmCancel(false);
  };

  if (!d) return <Spinner />;
  const r = d.request;
  const canCancel = ["new", "review", "info_waiting", "info_complete"].includes(r.status);
  return (
    <div className="card pad0">
      <div className="card-head">
        <div>
          <h3 style={{ marginBottom: ".2em" }}>{r.offer_title}</h3>
          <span className="small muted mono">#{r.id}</span>
        </div>
        <div className="flex">
          <Badge map={REQUEST_STATUSES} value={r.status} />
          {canCancel && <button className="btn sm danger-soft" onClick={() => setConfirmCancel(true)}>إلغاء الطلب</button>}
        </div>
      </div>
      <div className="card-body">
        {r.notes && <p><b>ملاحظاتك:</b> {r.notes}</p>}
        {r.files?.length > 0 && <FileChips files={r.files} />}

        {r.info_note && r.status === "info_waiting" && (
          <div className="alert warn"><b>الإدارة تطلب معلومات إضافية:</b><br />{r.info_note}</div>
        )}
        {r.status === "info_waiting" && (
          <form className="card" onSubmit={sendInfo} style={{ marginTop: "1rem" }}>
            <h4>أكمل المعلومات المطلوبة</h4>
            <Field label="الرد" req>
              <textarea required minLength={1} value={info.reply} onChange={(e) => setInfo({ reply: e.target.value })} />
            </Field>
            <div className="field">
              <label>مرفقات (اختياري)</label>
              <label className="drop">{files.length ? `📎 ${files.length} ملفات` : "اختيار ملفات"}
                <input type="file" hidden multiple accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFiles([...e.target.files])} />
              </label>
            </div>
            <button className="btn block" disabled={busy}>إرسال المعلومات</button>
          </form>
        )}

        {r.reject_reason && <div className="alert err"><b>سبب الرفض:</b> {r.reject_reason}</div>}
        {r.cancel_reason && <div className="alert warn"><b>سبب الإلغاء:</b> {r.cancel_reason}</div>}

        <h4 style={{ marginTop: "1.2rem" }}>سجل الحالة</h4>
        <div className="timeline">
          {r.history.map((h) => (
            <div className="t" key={h.id}>
              <b>{h.from_status === null ? "إنشاء الطلب" : REQUEST_STATUSES[h.to_status]?.label || h.to_status}</b>
              <span className="small muted"> — {h.by_name} · {fmtDate(h.created_at)}</span>
              {h.note && <div className="small muted">{h.note}</div>}
            </div>
          ))}
        </div>
      </div>
      {confirmCancel && (
        <Confirm danger title="إلغاء الطلب" msg="هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن الإلغاء."
          onOk={cancel} onClose={() => setConfirmCancel(false)} busy={busy} />
      )}
    </div>
  );
}

/* =================== التذاكر =================== */
export function Tickets() {
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("all");
  useEffect(() => {
    setD(null);
    api(`/api/client/tickets${qs({ page, status: tab === "all" ? "" : tab })}`).then(setD).catch(() => {});
  }, [page, tab]);
  const [opened, setOpened] = useState(false);
  const [f, setF] = useState({ subject: "", message: "", request_id: "" });
  const [files, setFiles] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();

  const openNew = async () => {
    setOpened(true);
    try {
      const r = await api("/api/client/requests?per=100");
      setReqs(r.requests.filter((x) => !["closed", "cancelled", "rejected"].includes(x.status)));
    } catch { /* لا يوجد */ }
  };
  const create = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("subject", f.subject); fd.append("message", f.message); fd.append("request_id", f.request_id || "");
    for (const x of files) fd.append("files", x);
    setBusy(true);
    try { const r = await api("/api/client/tickets", { method: "POST", form: fd }); toast("أُنشئت التذكرة"); setOpened(false); setF({ subject: "", message: "", request_id: "" }); setPage(1); setTab("all"); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false);
  };

  const tabs = [{ k: "all", label: "الكل" }, ...Object.entries(TICKET_STATUSES).map(([k, v]) => ({ k, label: v.label }))];
  return (
    <>
      <div className="card pad0">
        <div className="card-head"><h3>تذاكر الدعم الفني</h3><button className="btn sm" onClick={openNew}>+ تذكرة جديدة</button></div>
        <div style={{ padding: "0 .6rem" }}><Tabs items={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} /></div>
        {!d ? <Spinner /> : d.tickets?.length ? d.tickets.map((t) => (
          <Link key={t.id} to={`/account/tickets/${t.id}`} className="list-row">
            <div>
              <div className="t">{t.subject}</div>
              <div className="s">{t.offer_title ? `${t.offer_title} · ` : ""}{fmtDate(t.updated_at)}</div>
            </div>
            <Badge map={TICKET_STATUSES} value={t.status} />
          </Link>
        )) : <Empty icon="🎧" title="لا توجد تذاكر" />}
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>
      {opened && (
        <Modal title="تذكرة دعم جديدة" onClose={() => setOpened(false)}
          foot={<><button className="btn secondary" onClick={() => setOpened(false)}>إلغاء</button><button className="btn" form="tkt-form" disabled={busy}>إرسال</button></>}>
          <form id="tkt-form" onSubmit={create}>
            <Field label="الموضوع" req><input required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
            <Field label="الطلب المرتبط (اختياري)">
              <select value={f.request_id} onChange={(e) => setF({ ...f, request_id: e.target.value })}>
                <option value="">— بدون ربط —</option>
                {reqs.map((r) => <option key={r.id} value={r.id}>#{r.id} — {r.offer_title}</option>)}
              </select>
            </Field>
            <Field label="وصف المشكلة" req><textarea required minLength={20} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
            <div className="field"><label>مرفقات</label>
              <label className="drop">{files.length ? `📎 ${files.length} ملفات` : "اختيار ملفات"}
                <input type="file" hidden multiple accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFiles([...e.target.files])} />
              </label>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/* =================== تفاصيل تذكرة =================== */
export function TicketDetail() {
  const { id } = useParams();
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const load = () => api(`/api/client/tickets/${id}`).then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, [id]);

  const reply = async (e) => {
    e.preventDefault();
    const fd = new FormData(); fd.append("text", text);
    for (const f of files) fd.append("files", f);
    setBusy(true);
    try { await api(`/api/client/tickets/${id}/reply`, { method: "POST", form: fd }); setText(""); setFiles([]); load(); toast("تم إرسال ردك"); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false);
  };
  const close = async () => {
    setBusy(true);
    try { await api(`/api/client/tickets/${id}/close`, { method: "POST" }); load(); toast("أُغلقت التذكرة"); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false); setConfirmClose(false);
  };

  if (!d) return <Spinner />;
  const t = d.ticket;
  return (
    <div className="card pad0">
      <div className="card-head">
        <div>
          <h3 style={{ margin: 0 }}>{t.subject}</h3>
          <span className="small muted mono">#{t.id}</span>
        </div>
        <div className="flex">
          <Badge map={TICKET_STATUSES} value={t.status} />
          {t.status !== "closed" && <button className="btn sm danger-soft" onClick={() => setConfirmClose(true)}>إغلاق</button>}
        </div>
      </div>
      <div className="card-body">
        <div className="alert info small">التذكرة مرتبطة {t.request ? <>بالطلب <b className="mono">#{t.request.id}</b></> : "بلا طلب مرتبط"}</div>
        {t.message && <p><b>الرسالة:</b> {t.message}</p>}
        {t.files?.length > 0 && <FileChips files={t.files} />}
        <h4>المحادثة</h4>
        {t.replies?.length ? (
          <div className="timeline">
            {t.replies.map((r) => (
              <div className="t" key={r.id}>
                <b>{r.by_type === "admin" ? "الإدارة" : "أنت"}</b> <span className="small muted">· {fmtDate(r.created_at)}</span>
                <p style={{ margin: ".2em 0" }}>{r.text}</p>
                <FileChips files={r.files} />
              </div>
            ))}
          </div>
        ) : <p className="muted small">لا ردود بعد.</p>}
        <form className="card" onSubmit={reply} style={{ marginTop: "1rem" }}>
          <Field label="ردك" req><textarea required value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="field"><label>مرفقات</label>
            <label className="drop">{files.length ? `📎 ${files.length} ملفات` : "اختيار ملفات"}
              <input type="file" hidden multiple accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFiles([...e.target.files])} />
            </label>
          </div>
          <button className="btn block" disabled={busy}>إرسال الرد</button>
        </form>
      </div>
      {confirmClose && <Confirm danger title="إغلاق التذكرة" msg="يمكنك إعادة فتحها لاحقاً بإضافة رد جديد." onOk={close} onClose={() => setConfirmClose(false)} busy={busy} />}
    </div>
  );
}

/* =================== الإشعارات =================== */
export function Notifications() {
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const { refreshMe } = useApp();
  const load = async (p = page, read = "") => {
    setD(null);
    const r = await api(`/api/me/notifications${qs({ page: p, per: 15, read })}`);
    setD(r);
  };
  useEffect(() => { load(page, ""); }, [page]);
  const mark = async (id) => {
    try { await api(`/api/me/notifications/${id}/read`, { method: "POST" }); refreshMe(); load(page); } catch { }
  };
  const all = async () => {
    await api("/api/me/notifications/read-all", { method: "POST" });
    refreshMe(); load(page);
  };
  return (
    <div className="card pad0">
      <div className="card-head"><h3>الإشعارات</h3><button className="btn sm secondary" onClick={all}>تحديد الكل كمقروء</button></div>
      {!d ? <Spinner /> : d.notifications?.length ? (
        <div>
          {d.notifications.map((n) => (
            <div key={n.id} className="list-row" style={{ background: n.read ? "" : "var(--brand-soft)" }}>
              <div style={{ flex: 1 }}>
                <div className="t" style={{ fontWeight: n.read ? 600 : 800 }}>{n.title}</div>
                <div className="s">{n.body}</div>
                <div className="s">{fmtDate(n.created_at)}</div>
              </div>
              {!n.read && <button className="btn sm secondary" onClick={() => mark(n.id)}>مقروء</button>}
            </div>
          ))}
        </div>
      ) : <Empty icon="🔔" title="لا إشعارات" />}
      <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
    </div>
  );
}
