import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, qs, fmtDate, REQUEST_STATUSES, TICKET_STATUSES, requestNo, ticketNo } from "../../lib/api.jsx";
import { Spinner, Empty, Badge, Pager, Modal, Confirm, Field, FileChips } from "../../components/ui.jsx";
import { PageHead } from "../../components/shell.jsx";
import { useApp } from "../../store.jsx";

/* =================== الطلبات (قائمة + بحث) =================== */
export function Requests() {
  const [sp] = useSearchParams();
  const needs = sp.get("needs") === "1";
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(needs ? "action" : "all");
  const [offers, setOffers] = useState([]);
  useEffect(() => { api("/api/admin/requests/offers-select").then((r) => setOffers(r.offers)).catch(() => {}); }, []);
  useEffect(() => {
    setD(null);
    const status = tab === "all" ? "" : tab === "action" ? "" : tab;
    api(`/api/admin/requests${qs({ page, q, status, needs: tab === "action" ? "1" : "" })}`)
      .then(setD).catch((e) => alert(e.message));
  }, [page, q, tab]);
  const tabs = [
    { k: "all", label: "الكل" },
    { k: "action", label: "بانتظار إجراء" },
    ...Object.entries(REQUEST_STATUSES).map(([k, v]) => ({ k, label: v.label })),
  ];
  return (
    <>
      <PageHead title="إدارة الطلبات" sub="راجع الطلبات وحرّك حالتها بعدل وشفافية"
        actions={
          <div className="flex">
            <input placeholder="بحث: رقم الطلب / اسم العميل / بريده" value={q}
              onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
          </div>
        } />
      <div className="card pad0">
        <div style={{ padding: "0 .6rem" }}>
          <div className="tabs">
            {tabs.map((t) => <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => { setTab(t.k); setPage(1); }}>{t.label}</button>)}
          </div>
        </div>
        {!d ? <Spinner /> : d.requests?.length ? (
          <div>
            {d.requests.map((r) => (
              <Link key={r.id} to={`/admin/requests/${r.id}`} className="list-row">
                <div>
                  <div className="t">{r.offer_title}</div>
                  <div className="s">{requestNo(r)} · {r.user_name} ({r.user_email}) · {fmtDate(r.created_at)}</div>
                </div>
                <Badge map={REQUEST_STATUSES} value={r.status} />
              </Link>
            ))}
          </div>
        ) : <Empty icon="📋" title="لا طلبات مطابقة" />}
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>
    </>
  );
}

/* =================== تفاصيل طلب + تحريك الحالة =================== */
const REJ_REASONS = ["المستندات غير مكتملة", "لا تتوفر الشروط المطلوبة", "المعلومات المقدمة غير دقيقة", "الطلب مكرر"];
export function RequestDetail() {
  const { id } = useParams();
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ note: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api(`/api/admin/requests/${id}`).then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, [id]);

  const actions = {
    review: "بدء المراجعة",
    info_waiting: "طلب معلومات إضافية",
    accepted: "قبول الطلب",
    rejected: "رفض الطلب",
    cancelled: "إلغاء الطلب",
    completed: "إكمال الطلب",
    closed: "إغلاق الطلب",
  };

  const fire = async (to) => {
    setBusy(true);
    try {
      const body = { to, baseVersion: d.request.version, note: form.note, reason: form.reason };
      await api(`/api/admin/requests/${id}/transition`, { method: "POST", body });
      toast("تم تحديث حالة الطلب");
      setOpen(null); setForm({ note: "", reason: "" }); load();
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };

  if (!d) return <Spinner />;
  const r = d.request;
  const allowed = {
    new: ["review", "cancelled"],
    review: ["info_waiting", "accepted", "rejected", "cancelled"],
    info_waiting: ["cancelled"],
    info_complete: ["review", "info_waiting", "accepted", "rejected", "cancelled"],
    accepted: ["completed", "cancelled"],
    completed: ["closed"],
  }[r.status] || [];

  return (
    <>
      <PageHead title={`طلب ${r.offer_title}`} sub={`${requestNo(r)} · ${r.user?.name} · ${r.user?.email}`}
        actions={<Link className="btn secondary sm" to="/admin/requests">← كل الطلبات</Link>} />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
        <div className="card pad0">
          <div className="card-head">
            <div className="flex"><Badge map={REQUEST_STATUSES} value={r.status} /><span className="small muted">الإصدار v{r.version}</span></div>
            <span className="small muted">{fmtDate(r.created_at)}</span>
          </div>
          <div className="card-body">
            <p><b>ملاحظات العميل:</b></p>
            <p style={{ whiteSpace: "pre-wrap" }}>{r.notes || "—"}</p>
            <FileChips files={r.files} />
            {r.info?.length > 0 && (
              <>
                <h4>معلومات مضافة من العميل</h4>
                {r.info.map((i) => (
                  <div key={i.id} className="alert info">
                    <p style={{ margin: "0 0 .4em" }}>{i.reply}</p>
                    <FileChips files={i.files} />
                  </div>
                ))}
              </>
            )}
            {r.reject_reason && <div className="alert err">سبب الرفض: {r.reject_reason}</div>}
            {r.cancel_reason && <div className="alert warn">سبب الإلغاء: {r.cancel_reason}</div>}
            <h4 className="mt1">سجل الحركة</h4>
            <div className="timeline">
              {r.history.map((h) => (
                <div className="t" key={h.id}>
                  <b>{h.from_status ? REQUEST_STATUSES[h.to_status]?.label : "إنشاء الطلب"}</b>
                  <span className="small muted">{h.by_name} · {fmtDate(h.created_at)}</span>
                  {h.note && <div className="small">{h.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card" style={{ alignSelf: "start" }}>
          <h3>إجراءات الحالة</h3>
          {allowed.length ? (
            <div style={{ display: "grid", gap: ".5em" }}>
              {allowed.map((a) => (
                <button key={a} className="btn" onClick={() => setOpen(a)}>{actions[a] || a}</button>
              ))}
            </div>
          ) : <div className="alert ok small">الطلب في حالته النهائية.</div>}
          {r.status === "info_waiting" && (
            <div className="alert warn small mt1"><b>المطلوب من العميل:</b> {r.info_note || "—"}</div>
          )}
          {r.status === "info_complete" && (
            <div className="alert info small">بانتظار مراجعتك للمعلومات المقدمة — يمكنك قبول أو رفض أو طلب المزيد.</div>
          )}
        </div>
      </div>
      <style>{`@media(max-width:900px){ .grid[style]{grid-template-columns:1fr !important;} }`}</style>

      {open && (
        <Modal title={`${actions[open]} — ${r.offer_title}`} onClose={() => setOpen(null)}
          foot={<><button className="btn secondary" onClick={() => setOpen(null)}>إلغاء</button><button className="btn" disabled={busy} onClick={() => fire(open)}>{busy ? "جارٍ..." : "تنفيذ"}</button></>}>
          {open === "info_waiting" && (
            <Field label="ما هي المعلومات المطلوبة من العميل؟" req hint="سيظهر هذا النص للعميل ليرد عليه بالمستندات/البيانات">
              <textarea autoFocus value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} minLength={10} />
            </Field>
          )}
          {open === "rejected" && (
            <>
              <Field label="سبب الرفض (يظهر للعميل)" req>
                <select value={REJ_REASONS.includes(form.reason) ? form.reason : ""} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                  <option value="">— اختر —</option>
                  {REJ_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="أو اكتب سبباً خاصاً (10 أحرف على الأقل)">
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </Field>
            </>
          )}
          {open === "cancelled" && (
            <Field label="سبب الإلغاء (يظهر للعميل)" req>
              <textarea autoFocus minLength={10} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
          )}
          {["completed", "closed"].includes(open) && (
            <Field label="ملاحظة للعميل (اختياري)"><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          )}
          {open === "accepted" && <div className="alert ok small">سيُشعر العميل فوراً بقبول الطلب ويمكنك لاحقاً إكماله ثم إغلاقه.</div>}
        </Modal>
      )}
    </>
  );
}

/* =================== التذاكر =================== */
export function Tickets() {
  const [sp] = useSearchParams();
  const needs = sp.get("needs") === "1";
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(needs ? "action" : "all");
  useEffect(() => {
    setD(null);
    api(`/api/admin/tickets${qs({ page, q, status: tab === "action" ? "" : tab === "all" ? "" : tab, needs: tab === "action" ? "1" : "" })}`)
      .then(setD).catch((e) => alert(e.message));
  }, [page, q, tab]);
  const tabs = [{ k: "all", label: "الكل" }, { k: "action", label: "بانتظار رد" }, ...Object.entries(TICKET_STATUSES).map(([k, v]) => ({ k, label: v.label }))];
  return (
    <>
      <PageHead title="التذاكر" sub="دعم العملاء من مكان واحد"
        actions={<input placeholder="بحث بالرقم/الموضوع/العميل" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />} />
      <div className="card pad0">
        <div style={{ padding: "0 .6rem" }}>
          <div className="tabs">{tabs.map((t) => <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => { setTab(t.k); setPage(1); }}>{t.label}</button>)}</div>
        </div>
        {!d ? <Spinner /> : d.tickets?.length ? d.tickets.map((t) => (
          <Link key={t.id} to={`/admin/tickets/${t.id}`} className="list-row">
            <div><div className="t">{t.subject}</div><div className="s">{ticketNo(t)} · {t.user_name} · {fmtDate(t.updated_at)}</div></div>
            <Badge map={TICKET_STATUSES} value={t.status} />
          </Link>
        )) : <Empty icon="🎧" title="لا تذاكر مطابقة" />}
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>
    </>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const load = () => api(`/api/admin/tickets/${id}`).then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, [id]);

  const reply = async (e) => {
    e.preventDefault();
    const fd = new FormData(); fd.append("text", text);
    for (const f of files) fd.append("files", f);
    setBusy(true);
    try { await api(`/api/admin/tickets/${id}/reply`, { method: "POST", form: fd }); setText(""); setFiles([]); load(); toast("أُرسل الرد وأُشعر العميل"); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false);
  };
  const close = async () => {
    setBusy(true);
    try { await api(`/api/admin/tickets/${id}/close`, { method: "POST" }); load(); toast("تم إغلاق التذكرة"); }
    catch (e2) { toast(e2.message, "err"); }
    setBusy(false); setConfirmClose(false);
  };

  if (!d) return <Spinner />;
  const t = d.ticket;
  return (
    <>
      <PageHead title={`تذكرة: ${t.subject}`} sub={`${ticketNo(t)} · ${t.user?.name} · ${t.user?.email}`}
        actions={<><Link className="btn secondary sm" to="/admin/tickets">← الكل</Link><button className="btn sm danger-soft" disabled={t.status === "closed"} onClick={() => setConfirmClose(true)}>إغلاق</button></>} />
      <div className="card pad0">
        <div className="card-head">
          <Badge map={TICKET_STATUSES} value={t.status} />
          {t.request && <Link className="small" to={`/admin/requests/${t.request.id}`}>الطلب المرتبط: طلب رقم {t.request.seq ?? "—"}</Link>}
        </div>
        <div className="card-body">
          <p><b>الرسالة الأصلية:</b></p>
          <p style={{ whiteSpace: "pre-wrap" }}>{t.message}</p>
          <FileChips files={t.files} />
          <h4 className="mt1">المحادثة</h4>
          {t.replies?.map((r) => (
            <div key={r.id} className={`alert ${r.by_type === "admin" ? "ok" : "info"}`}>
              <b>{r.by_type === "admin" ? "الإدارة" : t.user?.name}</b>
              <span className="small muted"> · {fmtDate(r.created_at)}</span>
              <p style={{ margin: ".3em 0 0", whiteSpace: "pre-wrap" }}>{r.text}</p>
              <FileChips files={r.files} />
            </div>
          ))}
          <form className="card" onSubmit={reply}>
            <Field label="ردك للعميل" req hint="سيصل هذا الرد إشعاراً فورياً للعميل عبر WebSocket">
              <textarea required value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <div className="field"><label>مرفقات</label>
              <label className="drop">{files.length ? `📎 ${files.length}` : "اختيار ملفات"}
                <input type="file" hidden multiple accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFiles([...e.target.files])} />
              </label>
            </div>
            <button className="btn block" disabled={busy} style={{ marginTop: ".6rem" }}>إرسال الرد</button>
          </form>
        </div>
      </div>
      {confirmClose && <Confirm danger title="إغلاق التذكرة" msg="سيُشعر العميل بالإغلاق ويمكنه إعادة فتحها برسالة." onOk={close} onClose={() => setConfirmClose(false)} busy={busy} />}
    </>
  );
}

/* =================== العملاء =================== */
export function Users() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [detail, setDetail] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [temp, setTemp] = useState({ temp: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const load = (p = page) => {
    setD(null);
    api(`/api/admin/users${qs({ page: p, q, status: tab })}`).then(setD).catch((e) => alert(e.message));
  };
  useEffect(() => { load(page); }, [page, q, tab]);

  const toggle = async (u) => {
    if (!confirm(`ت${u.active ? "عطيل" : "فعيل"} حساب ${u.name}؟`)) return;
    await api(`/api/admin/users/${u.id}/toggle`, { method: "POST", body: { active: !u.active } });
    toast(u.active ? "عُطل الحساب" : "فُعّل الحساب");
    load(page); if (detail) setDetail({ ...detail, user: { ...detail.user, active: !u.active } });
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/users/${resetFor.id}/reset`, { method: "POST", body: temp });
      toast("أُعيد تعيين كلمة المرور — سجّل العميل الدخول بالكلمة المؤقتة");
      setResetFor(null); setTemp({ temp: "", confirm: "" });
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };

  const openDetail = async (u) => {
    const r = await api(`/api/admin/users/${u.id}`);
    setDetail(r);
  };

  return (
    <>
      <PageHead title="العملاء" sub="حسابات العملاء وطلباتهم وتذاكرهم"
        actions={<input placeholder="بحث بالاسم/البريد/الجوال" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />} />
      <div className="card pad0">
        <div style={{ padding: "0 .6rem" }}>
          <div className="tabs">
            {[["all", "الكل"], ["active", "نشط"], ["disabled", "معطل"]].map(([k, v]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPage(1); }}>{v}</button>
            ))}
          </div>
        </div>
        {!d ? <Spinner /> : d.users?.length ? (
          <div>
            {d.users.map((u) => (
              <div key={u.id} className="list-row">
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => openDetail(u)}>
                  <div className="t">{u.name} {!u.active && <span className="badge red">معطل</span>}</div>
                  <div className="s mono">{u.email} · {u.phone} · طلبات: {u.reqs} · تذاكر: {u.tks}</div>
                </div>
                <div className="flex">
                  <button className="btn sm secondary" onClick={() => openDetail(u)}>ملف</button>
                  <button className="btn sm secondary" onClick={() => setResetFor(u)}>كلمة مرور</button>
                  <button className={`btn sm ${u.active ? "danger-soft" : ""}`} onClick={() => toggle(u)}>{u.active ? "تعطيل" : "تفعيل"}</button>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty icon="👥" title="لا عملاء مطابقين" />}
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>

      {detail && (
        <Modal title={`ملف العميل — ${detail.user.name}`} onClose={() => setDetail(null)} wide>
          <div className="grid cols2">
            <div className="card">
              <p className="small"><b>البريد:</b> <span className="mono">{detail.user.email}</span></p>
              <p className="small"><b>الجوال:</b> <span className="mono">{detail.user.phone}</span></p>
              <p className="small"><b>انضم:</b> {fmtDate(detail.user.created_at)}</p>
              <p className="small"><b>آخر دخول:</b> {fmtDate(detail.user.last_login_at)}</p>
            </div>
            <div>
              <h4>أقرب الطلبات</h4>
              {detail.requests?.length ? detail.requests.map((r) => (
                <Link key={r.id} to={`/admin/requests/${r.id}`} className="list-row">
                  <span className="small">{requestNo(r)}</span><Badge map={REQUEST_STATUSES} value={r.status} />
                </Link>
              )) : <p className="muted small">لا طلبات</p>}
              <h4>التذاكر</h4>
              {detail.tickets?.length ? detail.tickets.map((t) => (
                <Link key={t.id} to={`/admin/tickets/${t.id}`} className="list-row">
                  <span className="small">{t.subject}</span><Badge map={TICKET_STATUSES} value={t.status} />
                </Link>
              )) : <p className="muted small">لا تذاكر</p>}
            </div>
          </div>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`إعادة تعيين كلمة مرور — ${resetFor.name}`} onClose={() => setResetFor(null)}
          foot={<><button className="btn secondary" onClick={() => setResetFor(null)}>إلغاء</button><button className="btn" onClick={reset} disabled={busy}>حفظ</button></>}>
          <Field label="كلمة مرور مؤقتة" req hint="سيلزم العميل تغييرها من حسابه (8+ أحرف صغير/كبير/رقم)">
            <input dir="ltr" value={temp.temp} onChange={(e) => setTemp({ ...temp, temp: e.target.value })} />
          </Field>
          <Field label="تأكيد" req><input dir="ltr" value={temp.confirm} onChange={(e) => setTemp({ ...temp, confirm: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
