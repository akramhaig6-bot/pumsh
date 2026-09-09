import { useEffect, useRef, useState } from "react";
import { api, qs, fmtDate, absUrl, OFFER_STATUSES, ARTICLE_STATUSES, PAGE_STATUSES } from "../../lib/api.jsx";
import { Spinner, Empty, Badge, Pager, Modal, Confirm, Field } from "../../components/ui.jsx";
import { PageHead } from "../../components/shell.jsx";
import { RichText, MediaPicker, ImageInput } from "../../components/media.jsx";
import { useApp } from "../../store.jsx";

/* ============================================================
   قالب عام لقائمة + محرر للمحتوى (عروض/مقالات/صفحات)
============================================================ */
function Slug({ value, onChange }) {
  return (
    <div className="field">
      <label>الرابط المختصر <span className="muted">— يظهر في رابط الصفحة، أحرف إنجليزية صغيرة وأرقام وشرطات (مثال: about-us)</span></label>
      <input dir="ltr" value={value} onChange={(e) => onChange(String(e.target.value).toLowerCase())} placeholder="example-slug" />
    </div>
  );
}

/* =================== العروض =================== */
export function Offers() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [editing, setEditing] = useState(null); // null | {} new | offer
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = (p = page) => {
    setD(null);
    api(`/api/admin/offers${qs({ page: p, q, status: tab })}`).then(setD).catch((e) => alert(e.message));
  };
  useEffect(() => { load(page); }, [page, q, tab]);

  const save = async (payload, saveKind) => {
    setBusy(true);
    try {
      if (editing?.id) await api(`/api/admin/offers/${editing.id}`, { method: "PUT", body: { ...payload, baseVersion: editing.version, save: saveKind } });
      else await api("/api/admin/offers", { method: "POST", body: { ...payload, save: saveKind } });
      toast("حُفظ العرض");
      setEditing(null); load(page);
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/admin/offers/${deleting.id}`, { method: "DELETE" }); toast("حُذف العرض"); setDeleting(null); load(page); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const flip = async (o, to) => {
    try {
      await api(`/api/admin/offers/${o.id}/status`, { method: "POST", body: { to } });
      toast(to === "published" ? "نُشر العرض" : "أُوقف العرض");
      load(page);
    } catch (e2) {
      if (e2.data?.code === "CONFIRM" && confirm(`هذا العرض له ${e2.data.activeCount} طلب نشط. إيقاف النشر سيمنع طلبات جديدة لكن سيُبقى الطلبات القائمة. متابعة؟`)) {
        await api(`/api/admin/offers/${o.id}/status`, { method: "POST", body: { to, confirmed: true } });
        toast("أُوقف العرض"); load(page);
      } else alert(e2.message);
    }
  };

  return (
    <>
      <PageHead title="العروض" sub="أنشئ وعدّل وانشر العروض بكل تفاصيلها"
        actions={<>
          <input placeholder="بحث بالعنوان" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
          <button className="btn" onClick={() => setEditing({})}>+ عرض جديد</button>
        </>} />
      <div className="card pad0">
        <div style={{ padding: "0 .6rem" }}>
          <div className="tabs">
            {[["all", "الكل"], ...Object.entries(OFFER_STATUSES).map(([k, v]) => [k, v.label])].map(([k, v]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPage(1); }}>{v}</button>
            ))}
          </div>
        </div>
        {!d ? <Spinner /> : d.offers?.length ? d.offers.map((o) => (
          <div key={o.id} className="list-row">
            <div style={{ flex: 1 }}>
              <div className="t">{o.title}</div>
              <div className="s">طلبات: {o.req_count} · تحديث: {fmtDate(o.updated_at)}</div>
            </div>
            <Badge map={OFFER_STATUSES} value={o.status} />
            <div className="flex">
              <button className="btn sm secondary" onClick={() => setEditing(o)}>تعديل</button>
              {o.status === "published"
                ? <button className="btn sm warn" onClick={() => flip(o, "unpublished")}>إيقاف</button>
                : <button className="btn sm" onClick={() => flip(o, "published")}>نشر</button>}
              {o.status === "draft" && <button className="btn sm danger-soft" onClick={() => setDeleting(o)}>حذف</button>}
            </div>
          </div>
        )) : <Empty icon="🏷️" title="لا عروض" sub="أنشئ أول عرض من زر «عرض جديد»" />}
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>

      {editing && (
        <OfferEditor offer={editing} busy={busy} onClose={() => setEditing(null)} onSave={save} />
      )}
      {deleting && <Confirm danger title="حذف العرض" msg={`حذف «${deleting.title}» نهائياً؟ المسودات فقط تُحذف; المنشور يُوقف بدلاً من ذلك.`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}

function OfferEditor({ offer, onClose, onSave, busy }) {
  const [f, setF] = useState({
    title: offer.title || "", summary: offer.summary || "", image: offer.image || "",
    description_html: offer.description_html || "", terms_html: offer.terms_html || "",
    start_date: offer.start_date && offer.start_date.slice(0, 10), end_date: offer.end_date && offer.end_date.slice(0, 10),
  });
  return (
    <Modal title={offer.id ? `تعديل: ${offer.title}` : "عرض جديد"} onClose={onClose} wide
      foot={<>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
        <button className="btn secondary" disabled={busy} onClick={() => onSave(f, "save")}>حفظ كمسودة</button>
        <button className="btn" disabled={busy} onClick={() => onSave(f, "publish")}>حفظ ونشر</button>
      </>}>
      <div className="row2">
        <Field label="عنوان العرض" req><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <ImageInput label="الصورة الرئيسية" value={f.image} onChange={(v) => setF({ ...f, image: v })} />
      </div>
      <Field label="وصف مختصر (يظهر في البطاقات)" req hint="20 حرفاً على الأقل"><textarea rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
      <div className="row2">
        <Field label="تاريخ البداية (اختياري)"><input type="date" value={f.start_date || ""} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="تاريخ النهاية (اختياري)"><input type="date" value={f.end_date || ""} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
      </div>
      <Field label="الوصف التفصيلي" req><RichText value={f.description_html} onChange={(v) => setF({ ...f, description_html: v })} /></Field>
      <Field label="الشروط والأحكام (اختياري)"><RichText value={f.terms_html} onChange={(v) => setF({ ...f, terms_html: v })} /></Field>
    </Modal>
  );
}

/* =================== المقالات =================== */
export function Articles() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [cats, setCats] = useState([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (p = page) => { setD(null); api(`/api/cms/articles${qs({ page: p, q, status: tab === "all" ? "" : tab })}`).then(setD).catch((e) => alert(e.message)); };
  useEffect(() => { load(page); }, [page, q, tab]);
  useEffect(() => { api("/api/cms/categories").then((r) => setCats(r.categories)).catch(() => {}); }, []);
  const save = async (payload, saveKind) => {
    setBusy(true);
    try {
      if (editing?.id) await api(`/api/cms/articles/${editing.id}`, { method: "PUT", body: { ...payload, baseVersion: editing.version, save: saveKind } });
      else await api("/api/cms/articles", { method: "POST", body: { ...payload, save: saveKind } });
      toast("حُفظ المقال"); setEditing(null); load(page);
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/cms/articles/${deleting.id}`, { method: "DELETE" }); toast("حُذف المقال"); setDeleting(null); load(page); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="المقالات" sub="مكتبة المحتوى المعرفي للمنصة"
        actions={<><input placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /><button className="btn" onClick={() => setEditing({})}>+ مقال جديد</button></>} />
      <div className="card pad0">
        <div style={{ padding: "0 .6rem" }}>
          <div className="tabs">
            {[["all", "الكل"], ...Object.entries(ARTICLE_STATUSES).map(([k, v]) => [k, v.label])].map(([k, v]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPage(1); }}>{v}</button>
            ))}
          </div>
        </div>
        {!d ? <Spinner /> : d.articles?.length ? d.articles.map((a) => (
          <div key={a.id} className="list-row">
            <div style={{ flex: 1 }}>
              <div className="t">{a.title}</div>
              <div className="s">{a.category_name || "بدون تصنيف"} · {fmtDate(a.updated_at)}</div>
            </div>
            <Badge map={ARTICLE_STATUSES} value={a.status} />
            <div className="flex">
              <button className="btn sm secondary" onClick={() => setEditing(a)}>تعديل</button>
              <button className="btn sm danger-soft" onClick={() => setDeleting(a)}>حذف</button>
            </div>
          </div>
        )) : <Empty icon="📰" title="لا مقالات" />}
        <div style={{ padding: "0 1rem 1rem" }}><Pager page={d?.pagination?.page} pages={d?.pagination?.pages} onChange={setPage} /></div>
      </div>
      {editing && <ArticleEditor article={editing} cats={cats} busy={busy} onClose={() => setEditing(null)} onSave={save} />}
      {deleting && <Confirm danger title="حذف المقال" msg={`حذف «${deleting.title}» نهائياً؟`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}

function ArticleEditor({ article, cats, onClose, onSave, busy }) {
  const [f, setF] = useState({
    title: article.title || "", slug: article.slug || "", image: article.image || "",
    excerpt: article.excerpt || "", content_html: article.content_html || "",
    category_id: article.category_id || "", meta_title: article.meta_title || "", meta_description: article.meta_description || "",
  });
  return (
    <Modal title={article.id ? "تعديل مقال" : "مقال جديد"} onClose={onClose} wide
      foot={<>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
        <button className="btn secondary" disabled={busy} onClick={() => onSave(f, "save")}>مسودة</button>
        <button className="btn" disabled={busy} onClick={() => onSave(f, "publish")}>حفظ ونشر</button>
      </>}>
      <div className="row2">
        <Field label="العنوان" req><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Slug value={f.slug} onChange={(v) => setF({ ...f, slug: v })} />
      </div>
      <div className="row2">
        <Field label="التصنيف"><select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          <option value="">بدون تصنيف</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></Field>
        <ImageInput label="الصورة البارزة" value={f.image} onChange={(v) => setF({ ...f, image: v })} />
      </div>
      <Field label="مقتطف (يظهر في البطاقات)"><textarea rows={2} value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} /></Field>
      <Field label="المحتوى" req><RichText value={f.content_html} onChange={(v) => setF({ ...f, content_html: v })} /></Field>
      <div className="row2">
        <Field label="عنوان SEO (اختياري)"><input value={f.meta_title} onChange={(e) => setF({ ...f, meta_title: e.target.value })} /></Field>
        <Field label="وصف SEO (اختياري)"><input value={f.meta_description} onChange={(e) => setF({ ...f, meta_description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* =================== الصفحات =================== */
export function Pages() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/cms/pages").then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const save = async (payload, saveKind) => {
    setBusy(true);
    try {
      if (editing?.id) await api(`/api/cms/pages/${editing.id}`, { method: "PUT", body: { ...payload, save: saveKind } });
      else await api("/api/cms/pages", { method: "POST", body: { ...payload, save: saveKind } });
      toast("حُفظت الصفحة"); setEditing(null); load();
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/cms/pages/${deleting.id}`, { method: "DELETE" }); toast("حُذفت الصفحة"); setDeleting(null); load(); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const essential = ["terms", "privacy", "about", "contact"];
  return (
    <>
      <PageHead title="الصفحات الثابتة" sub="صفحات مثل من نحن، الخصوصية، الشروط"
        actions={<button className="btn" onClick={() => setEditing({})}>+ صفحة جديدة</button>} />
      <div className="card pad0">
        {!d ? <Spinner /> : d.pages?.length ? d.pages.map((p) => (
          <div key={p.id} className="list-row">
            <div style={{ flex: 1 }}>
              <div className="t">{p.title} {essential.includes(p.slug) && <span className="chip">أساسية</span>}</div>
              <div className="s mono">/{p.slug} · {fmtDate(p.updated_at)}</div>
            </div>
            <Badge map={PAGE_STATUSES} value={p.status} />
            <div className="flex">
              <button className="btn sm secondary" onClick={() => setEditing(p)}>تعديل</button>
              {!essential.includes(p.slug) && <button className="btn sm danger-soft" onClick={() => setDeleting(p)}>حذف</button>}
            </div>
          </div>
        )) : <Empty icon="📄" title="لا صفحات" />}
      </div>
      {editing && (
        <Modal title={editing.id ? "تعديل صفحة" : "صفحة جديدة"} onClose={() => setEditing(null)} wide
          foot={<>
            <button className="btn secondary" onClick={() => setEditing(null)}>إلغاء</button>
            <button className="btn secondary" disabled={busy} onClick={() => save(editing, "save")}>مسودة</button>
            <button className="btn" disabled={busy} onClick={() => save(editing, "publish")}>حفظ ونشر</button>
          </>}>
          <PageForm page={editing} onChange={setEditing} />
        </Modal>
      )}
      {deleting && <Confirm danger title="حذف الصفحة" msg={`حذف «${deleting.title}» نهائياً؟`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}

function PageForm({ page, onChange }) {
  return (
    <>
      <div className="row2">
        <Field label="عنوان الصفحة" req><input value={page.title || ""} onChange={(e) => onChange({ ...page, title: e.target.value })} /></Field>
        <Slug value={page.slug || ""} onChange={(v) => onChange({ ...page, slug: v })} />
      </div>
      <Field label="المحتوى" req><RichText value={page.content_html || ""} onChange={(v) => onChange({ ...page, content_html: v })} /></Field>
    </>
  );
}

/* =================== التصنيفات =================== */
export function Categories() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/cms/categories").then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (editing?.id) await api(`/api/cms/categories/${editing.id}`, { method: "PUT", body: editing });
      else await api("/api/cms/categories", { method: "POST", body: editing });
      toast("حُفظ التصنيف"); setEditing(null); load();
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/cms/categories/${deleting.id}`, { method: "DELETE" }); toast("حُذف التصنيف"); setDeleting(null); load(); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="التصنيفات" sub="نظّم المقالات في تصنيفات واضحة"
        actions={<button className="btn" onClick={() => setEditing({ name: "", slug: "", description: "" })}>+ تصنيف</button>} />
      <div className="card pad0">
        {!d ? <Spinner /> : d.categories?.length ? d.categories.map((c) => (
          <div key={c.id} className="list-row">
            <div style={{ flex: 1 }}>
              <div className="t">{c.name}</div>
              <div className="s mono">{c.slug} · مقالات: {c.articles_count}</div>
            </div>
            <div className="flex">
              <button className="btn sm secondary" onClick={() => setEditing(c)}>تعديل</button>
              <button className="btn sm danger-soft" disabled={c.articles_count > 0} title={c.articles_count > 0 ? "مرتبط بمقالات" : ""} onClick={() => setDeleting(c)}>حذف</button>
            </div>
          </div>
        )) : <Empty icon="🗄️" title="لا تصنيفات" />}
      </div>
      {editing && (
        <Modal title={editing.id ? "تعديل تصنيف" : "تصنيف جديد"} onClose={() => setEditing(null)}
          foot={<><button className="btn secondary" onClick={() => setEditing(null)}>إلغاء</button><button className="btn" form="cat-form" disabled={busy}>حفظ</button></>}>
          <form id="cat-form" onSubmit={save}>
            <Field label="الاسم" req><input required value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Slug value={editing.slug || ""} onChange={(v) => setEditing({ ...editing, slug: v })} />
            <Field label="الوصف"><textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          </form>
        </Modal>
      )}
      {deleting && <Confirm danger title="حذف التصنيف" msg={`حذف «${deleting.name}»؟`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}

/* =================== البانرات =================== */
export function Banners() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [offers, setOffers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api("/api/cms/banners"), api("/api/admin/offers?per=100")])
    .then(([b, o]) => { setD(b); setOffers(o.offers || []); }).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (editing?.id) await api(`/api/cms/banners/${editing.id}`, { method: "PUT", body: editing });
      else await api("/api/cms/banners", { method: "POST", body: editing });
      toast("حُفظ البانر"); setEditing(null); load();
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/cms/banners/${deleting.id}`, { method: "DELETE" }); toast("حُذف البانر"); setDeleting(null); load(); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="البانرات" sub="صور الواجهة الرئيسية مع نصوص وأزرار وإحصاء نقرات"
        actions={<button className="btn" onClick={() => setEditing({ status: "draft", position: "hero", ord: (d?.banners?.length || 0) + 1 })}>+ بانر جديد</button>} />
      <div className="card pad0">
        {!d ? <Spinner /> : d.banners?.length ? d.banners.map((b) => (
          <div key={b.id} className="list-row">
            <img className="thumb" src={absUrl(b.image)} alt="" />
            <div style={{ flex: 1 }}>
              <div className="t">{b.headline || b.name || "بانر بدون عنوان"}</div>
              <div className="s">نقرات: {b.clicks} · ترتيب: {b.ord} · {fmtDate(b.updated_at)}</div>
            </div>
            <Badge map={OFFER_STATUSES} value={b.status} />
            <div className="flex">
              <button className="btn sm secondary" onClick={() => setEditing(b)}>تعديل</button>
              <button className="btn sm danger-soft" onClick={() => setDeleting(b)}>حذف</button>
            </div>
          </div>
        )) : <Empty icon="🖼️" title="لا بانرات" />}
      </div>
      {editing && (
        <Modal title={editing.id ? "تعديل بانر" : "بانر جديد"} onClose={() => setEditing(null)} wide
          foot={<><button className="btn secondary" onClick={() => setEditing(null)}>إلغاء</button><button className="btn" form="ban-form" disabled={busy}>حفظ</button></>}>
          <form id="ban-form" onSubmit={save}>
            <div className="row2">
              <Field label="العنوان الرئيسي"><input value={editing.headline || ""} onChange={(e) => setEditing({ ...editing, headline: e.target.value })} /></Field>
              <Field label="النص الفرعي"><input value={editing.subline || ""} onChange={(e) => setEditing({ ...editing, subline: e.target.value })} /></Field>
            </div>
            <ImageInput label="الصورة" value={editing.image || ""} onChange={(v) => setEditing({ ...editing, image: v })} />
            <div className="row2">
              <Field label="نص الزر"><input value={editing.button_text || ""} onChange={(e) => setEditing({ ...editing, button_text: e.target.value })} /></Field>
              <Field label="رابط الزر"><input dir="ltr" value={editing.button_link || ""} onChange={(e) => setEditing({ ...editing, button_link: e.target.value })} placeholder="/offers" /></Field>
            </div>
            <div className="row2">
              <Field label="عرض مرتبط (يُسجَّل الطلب منه)"><select value={editing.related_offer_id || ""} onChange={(e) => setEditing({ ...editing, related_offer_id: e.target.value })}>
                <option value="">— بدون —</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select></Field>
              <Field label="الترتيب"><input type="number" value={editing.ord ?? 0} onChange={(e) => setEditing({ ...editing, ord: Number(e.target.value) })} /></Field>
            </div>
            <div className="row2">
              <Field label="تاريخ البدء"><input type="date" value={(editing.start_date || "").slice(0, 10)} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} /></Field>
              <Field label="تاريخ النهاية"><input type="date" value={(editing.end_date || "").slice(0, 10)} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} /></Field>
            </div>
            <div className="row2">
              <Field label="الحالة"><select value={editing.status || "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="draft">مسودة</option><option value="published">منشور</option>
              </select></Field>
              <Field label="الموضع"><select value={editing.position || "hero"} onChange={(e) => setEditing({ ...editing, position: e.target.value })}>
                <option value="hero">الواجهة الرئيسية</option><option value="about">قسم من نحن</option>
              </select></Field>
            </div>
          </form>
        </Modal>
      )}
      {deleting && <Confirm danger title="حذف البانر" msg={`حذف «${deleting.headline || deleting.name}»؟`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}

/* =================== القوائم =================== */
export function Menus() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/cms/menus").then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (editing?.id) await api(`/api/cms/menus/${editing.id}`, { method: "PUT", body: editing });
      else await api("/api/cms/menus", { method: "POST", body: editing });
      toast("حُفظ عنصر القائمة"); setEditing(null); load();
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/cms/menus/${deleting.id}`, { method: "DELETE" }); toast("حُذف العنصر"); setDeleting(null); load(); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="قوائم التنقل" sub="تحكم كامل بروابط الموقع من الإدارة"
        actions={<button className="btn" onClick={() => setEditing({ destination: "link", ord: (d?.menus?.length || 0) + 1, status: "published" })}>+ عنصر</button>} />
      <div className="card pad0">
        {!d ? <Spinner /> : d.menus?.length ? d.menus.map((m) => (
          <div key={m.id} className="list-row">
            <div style={{ flex: 1 }}>
              <div className="t">{m.name}</div>
              <div className="s mono">{m.destination} → {m.target} · ترتيب {m.ord}</div>
            </div>
            <Badge map={OFFER_STATUSES} value={m.status} />
            <div className="flex">
              <button className="btn sm secondary" onClick={() => setEditing(m)}>تعديل</button>
              <button className="btn sm danger-soft" onClick={() => setDeleting(m)}>حذف</button>
            </div>
          </div>
        )) : <Empty icon="🧭" title="لا عناصر في القوائم" />}
      </div>
      {editing && (
        <Modal title={editing.id ? "تعديل عنصر" : "عنصر قائمة جديد"} onClose={() => setEditing(null)}
          foot={<><button className="btn secondary" onClick={() => setEditing(null)}>إلغاء</button><button className="btn" form="menu-form" disabled={busy}>حفظ</button></>}>
          <form id="menu-form" onSubmit={save}>
            <Field label="الاسم الظاهر" req><input required value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="نوع الوجهة" req>
              <select value={editing.destination} onChange={(e) => setEditing({ ...editing, destination: e.target.value })}>
                <option value="link">رابط مباشر</option><option value="page">صفحة داخلية</option>
                <option value="category">تصنيف مقالات</option><option value="section">قسم رئيسي (#)</option>
              </select>
            </Field>
            <Field label="الوجهة" req hint={editing.destination === "page" ? "مثال: about أو privacy أو terms أو contact" : editing.destination === "category" ? "الرمز المختصر للتصنيف (مثال: news)" : editing.destination === "section" ? "offers أو articles" : "مثال: /offers"}>
              <input dir="ltr" required value={editing.target || ""} onChange={(e) => setEditing({ ...editing, target: e.target.value })} />
            </Field>
            <div className="row2">
              <Field label="الترتيب"><input type="number" value={editing.ord ?? 0} onChange={(e) => setEditing({ ...editing, ord: Number(e.target.value) })} /></Field>
              <Field label="الحالة"><select value={editing.status || "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="draft">مخفية</option><option value="published">ظاهرة</option>
              </select></Field>
            </div>
          </form>
        </Modal>
      )}
      {deleting && <Confirm danger title="حذف العنصر" msg={`حذف «${deleting.name}» من القوائم؟`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}

/* =================== النصوص =================== */
export function Texts() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => api("/api/cms/texts").then(setD).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const save = async (t) => {
    setBusy(t.key);
    try { await api(`/api/cms/texts/${encodeURIComponent(t.key)}`, { method: "PUT", body: { value: t.value } }); toast("حُفظ النص"); load(); }
    catch (e2) { alert(e2.message); }
    setBusy(null);
  };
  return (
    <>
      <PageHead title="النصوص العامة" sub="غيّر أي عبارة في الموقع بدون تعديل كود" />
      <div className="grid cols2">
        {!d ? <Spinner /> : d.texts?.length ? d.texts.map((t) => (
          <div className="card" key={t.key}>
            <div className="small mono" style={{ color: "var(--brand)", marginBottom: ".4em" }}>{t.key}</div>
            <textarea rows={2} defaultValue={t.value} id={`txt-${t.key}`} />
            <div className="flex end mt1">
              <button className="btn sm" disabled={busy === t.key} onClick={() => save({ ...t, value: document.getElementById(`txt-${t.key}`).value })}>
                {busy === t.key ? "جارٍ..." : "حفظ"}
              </button>
            </div>
          </div>
        )) : null}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h4>إضافة نص جديد</h4>
          <AddText onDone={(k) => { setD(null); load(); setBusy(k); }} />
        </div>
      </div>
    </>
  );
}

function AddText({ onDone }) {
  const [f, setF] = useState({ key: "", value: "" });
  return (
    <form className="row2" onSubmit={async (e) => {
      e.preventDefault();
      try { await api("/api/cms/texts", { method: "POST", body: f }); onDone(f.key); setF({ key: "", value: "" }); }
      catch (e2) { alert(e2.message); }
    }}>
      <input dir="ltr" required placeholder="المفتاح: home.offers_title" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
      <input required placeholder="القيمة الافتراضية" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
      <button className="btn">إضافة</button>
    </form>
  );
}

/* =================== الوسائط =================== */
export function Media() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const load = (p = page) => { setD(null); api(`/api/cms/media${qs({ page: p, per: 30, q })}`).then(setD).catch((e) => alert(e.message)); };
  useEffect(() => { load(page); }, [page, q]);
  const up = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const r = await api("/api/cms/media/upload", { method: "POST", form });
      toast(`رُفع ${r.media?.length || files.length} ملف`);
      load(1); setPage(1);
    } catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/cms/media/${deleting.id}`, { method: "DELETE" }); toast("حُذف الملف"); setDeleting(null); load(page); }
    catch (e2) { alert(e2.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="مكتبة الوسائط" sub="ارفع واستخدم الصور في كل المحتوى — تُخزن محلياً"
        actions={<>
          <div className="flex"><input placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /></div>
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "جارٍ..." : "⬆ رفع ملفات"}</button>
          <input ref={fileRef} type="file" hidden multiple accept="image/*" onChange={(e) => up(e.target.files)} />
        </>} />
      <div className="card">
        {!d ? <Spinner /> : d.media?.length ? (
          <>
            <div className="media-grid">
              {d.media.map((m) => (
                <div key={m.id} className="m">
                  <img src={absUrl(`/api/up/${encodeURIComponent(m.stored_name)}`)} alt={m.original_name} loading="lazy" />
                  <div className="cap" title={m.original_name}>{m.original_name}</div>
                  <div className="flex" style={{ padding: "0 .4em .5em" }}>
                    <button className="btn sm secondary" style={{ flex: 1 }} onClick={() => { navigator.clipboard?.writeText(`/api/up/${encodeURIComponent(m.stored_name)}`); toast("نُسخ الرابط"); }}>نسخ</button>
                    <button className="btn sm danger-soft" onClick={() => setDeleting(m)}>حذف</button>
                  </div>
                </div>
              ))}
            </div>
            <Pager page={d.pagination?.page} pages={d.pagination?.pages} onChange={setPage} />
          </>
        ) : <Empty icon="📁" title="لا ملفات" sub="ارفع أول صورة من الزر أعلاه" />}
      </div>
      {deleting && <Confirm danger title="حذف الملف" msg={`حذف «${deleting.original_name}» نهائياً من الخادم؟`} onOk={remove} onClose={() => setDeleting(null)} busy={busy} />}
    </>
  );
}
