import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, qs, fmtDate } from "../lib/api.jsx";
import { Spinner, Empty, Badge, Pager } from "../components/ui.jsx";
import { OFFER_STATUSES, ARTICLE_STATUSES } from "../lib/api.jsx";
import { useApp } from "../store.jsx";

/* =================== الرئيسية =================== */
export function Home() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/home").then(setD).catch(() => {}); }, []);
  if (!d) return <Spinner />;
  const { banners, offers, articles, meta } = d;
  const banner = banners?.[0];
  return (
    <>
      {!banner ? (
        <div className="hero">
          <div className="wrap">
            <h1>{meta?.tagline || "مساحة أهدأ لفرصٍ أوضح"}</h1>
            <p>{meta?.description || ""}</p>
            <div className="actions">
              <Link className="btn lg" to="/offers">تصفح العروض</Link>
              <Link className="btn lg secondary" to="/register">إنشاء حساب</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="hero" style={{ paddingBottom: 0 }}>
          <div className="wrap banner-slide" style={{ paddingBottom: "3.4rem" }}>
            <img src={banner.image} alt={banner.headline} style={{ borderRadius: 18 }} />
          </div>
        </div>
      )}
      {offers?.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section-head">
              <h2>العروض المتاحة</h2>
              <Link className="btn ghost sm" to="/offers">عرض الكل ←</Link>
            </div>
            <div className="grid cols3">
              {offers.map((o) => <OfferCard key={o.id} o={o} />)}
            </div>
          </div>
        </section>
      )}
      {articles?.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head">
              <h2>قراءات وأفكار</h2>
              <Link className="btn ghost sm" to="/articles">عرض الكل ←</Link>
            </div>
            <div className="grid cols3">
              {articles.map((a) => <ArticleCard key={a.id} a={a} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

export function OfferCard({ o }) {
  return (
    <div className="card offer-card">
      {o.image && <img className="img" src={o.image} alt={o.title} loading="lazy" />}
      <div className="body">
        <h3><Link to={`/offers/${o.id}`}>{o.title}</Link></h3>
        <p>{o.summary}</p>
        <div className="foot">
          <span className="small muted">📅 {fmtDate(o.start_date || o.created_at)}</span>
          <Link className="btn sm" to={`/offers/${o.id}`}>التفاصيل</Link>
        </div>
      </div>
    </div>
  );
}

export function ArticleCard({ a }) {
  return (
    <div className="card article-card">
      {a.image && <img className="img" src={a.image} alt={a.title} loading="lazy" />}
      <div className="body">
        {a.category_name && <span className="chip">{a.category_name}</span>}
        <h3><Link to={`/articles/${a.id}`}>{a.title}</Link></h3>
        <p>{a.excerpt?.slice(0, 130)}</p>
        <span className="small muted">{fmtDate(a.created_at)}</span>
      </div>
    </div>
  );
}

/* =================== العروض =================== */
export function Offers() {
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qv, setQv] = useState("");

  useEffect(() => {
    api(`/api/offers${qs({ page, q })}`).then(setD).catch((e) => alert(e.message));
  }, [page, q]);

  return (
    <div className="wrap" style={{ padding: "2rem 1rem" }}>
      <div className="flex between wrap-any" style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>العروض المتاحة</h1>
        <form className="flex" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(qv.trim()); }}>
          <input value={qv} onChange={(e) => setQv(e.target.value)} placeholder="ابحث في العروض..." style={{ width: 260 }} />
          <button className="btn">بحث</button>
          {qv && <button type="button" className="btn sm secondary" onClick={() => { setQ(""); setQv(""); setPage(1); }}>مسح</button>}
        </form>
      </div>
      {!d ? <Spinner /> : d.offers?.length ? (
        <>
          <div className="grid cols3">
            {d.offers.map((o) => <OfferCard key={o.id} o={o} />)}
          </div>
          <Pager page={d.pagination?.page} pages={d.pagination?.pages} onChange={setPage} />
        </>
      ) : <Empty icon="🔎" title="لا توجد نتائج" sub="جرّب كلمة بحث أخرى أو عد لاحقاً" />}
    </div>
  );
}

/* =================== تفاصيل عرض =================== */
export function OfferDetail() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ notes: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/api/offers/${id}`).then(setD).catch((e) => alert(e.message)); }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("offer_id", d.offer.id);
    fd.append("notes", form.notes);
    for (const f of files) fd.append("files", f);
    setBusy(true);
    try {
      const r = await api("/api/client/requests", { method: "POST", form: fd });
      toast("تم إرسال طلبك بنجاح");
      nav(`/account/requests/${r.request.id}`);
    } catch (err) { toast(err.message, "err"); }
    setBusy(false);
  };

  if (!d) return <Spinner />;
  return (
    <div className="wrap" style={{ padding: "2rem 1rem" }}>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: "1.3rem" }}>
        <div>
          <div className="card pad0">
            {d.offer.image && <img src={d.offer.image} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover" }} />}
            <div className="card-body">
              <h1>{d.offer.title}</h1>
              <p className="muted">{d.offer.summary}</p>
              <hr style={{ border: "0", borderTop: "1px solid var(--line)" }} />
              <div className="prose" dangerouslySetInnerHTML={{ __html: d.offer.description_html }} />
              {d.offer.terms_html && (
                <>
                  <h3>الشروط</h3>
                  <div className="prose" dangerouslySetInnerHTML={{ __html: d.offer.terms_html }} />
                </>
              )}
              <div className="flex wrap-any" style={{ marginTop: "1rem" }}>
                {d.offer.start_date && <span className="chip">🟢 يبدأ: {fmtDate(d.offer.start_date)}</span>}
                {d.offer.end_date && <span className="chip">🔚 ينتهي: {fmtDate(d.offer.end_date)}</span>}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="card" style={{ position: "sticky", top: "1rem" }}>
            <h3>قدّم طلبك</h3>
            {!user && <div className="alert info">سجّل الدخول أولاً لإرسال طلب — <Link to={`/login?next=/offers/${id}`}>تسجيل الدخول</Link></div>}
            {d.activeRequestId ? (
              <div className="alert ok">لديك طلب نشط لهذا العرض: <Link to={`/account/requests/${d.activeRequestId}`}>متابعة الطلب</Link></div>
            ) : user?.role === "client" && !d.expired ? (
              <form onSubmit={submit}>
                <div className="field">
                  <label className="req">وصف احتياجك / ملاحظات</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="اكتب تفاصيل طلبك أو أي ملاحظة تهمّنا..." maxLength={5000} />
                </div>
                <div className="field">
                  <label>مرفقات (اختياري — حتى 8 ملفات)</label>
                  <label className="drop">{files.length ? `📎 ${files.length} ملف محدد` : "اضغط لاختيار ملفات (PDF/صور/مستندات)"}
                    <input type="file" hidden multiple
                      accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/svg+xml"
                      onChange={(e) => setFiles([...e.target.files])} />
                  </label>
                  <div className="hint">الحد الأقصى 5 ميغابايت للملف، والصيغ: JPG, PNG, WEBP, SVG, PDF, DOC, DOCX</div>
                </div>
                {d.expired && <div className="alert warn">انتهت فترة هذا العرض — لا يمكن إرسال طلبات جديدة.</div>}
                <button className="btn lg block" disabled={busy}>{busy ? "جارٍ الإرسال..." : "إرسال الطلب"}</button>
              </form>
            ) : user?.role === "admin" ? (
              <div className="alert info">أنت مشرف — الطلبات تُقدم من حساب عميل.</div>
            ) : (
              <div className="alert warn">إنشاء حساب عميل للتمكن من تقديم الطلب.</div>
            )}
          </div>
        </div>
      </div>
      <style>{`@media(max-width:900px){ .grid[style]{grid-template-columns:1fr !important;} }`}</style>
    </div>
  );
}

/* =================== المقالات =================== */
export function Articles() {
  const [sp] = useSearchParams();
  const [d, setD] = useState(null);
  const [page, setPage] = useState(1);
  const cat = sp.get("category") || "";
  useEffect(() => { api(`/api/articles${qs({ page, category: cat })}`).then(setD).catch(() => {}); }, [page, cat]);
  return (
    <div className="wrap" style={{ padding: "2rem 1rem" }}>
      <h1>المقالات والمواضيع</h1>
      {!d ? <Spinner /> : d.articles?.length ? (
        <>
          <div className="grid cols3">
            {d.articles.map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
          <Pager page={d.pagination?.page} pages={d.pagination?.pages} onChange={setPage} />
        </>
      ) : <Empty icon="📰" title="لا توجد مقالات بعد" />}
    </div>
  );
}

export function ArticleDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api(`/api/articles/${id}`).then(setD).catch((e) => alert(e.message)); }, [id]);
  if (!d) return <Spinner />;
  return (
    <div className="wrap" style={{ padding: "2rem 1rem", maxWidth: 820 }}>
      <div className="card pad0">
        {d.article.image && <img src={d.article.image} alt="" style={{ width: "100%", maxHeight: 360, objectFit: "cover" }} />}
        <div className="card-body">
          {d.article.category_name && <span className="chip">{d.article.category_name}</span>}
          <h1>{d.article.title}</h1>
          <p className="small muted">{fmtDate(d.article.created_at)}</p>
          <div className="prose" dangerouslySetInnerHTML={{ __html: d.article.content_html }} />
        </div>
      </div>
      {d.related?.length > 0 && (
        <div className="mt2">
          <h3>مقالات ذات صلة</h3>
          <div className="grid cols3">
            {d.related.map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== صفحة ثابتة =================== */
export function PageView() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api(`/api/pages/${slug}`).then(setD).catch((e) => setD({ notFound: true })); }, [slug]);
  if (!d) return <Spinner />;
  if (d.notFound) return <div className="wrap"><Empty icon="📄" title="الصفحة غير متاحة" /></div>;
  return (
    <div className="wrap" style={{ padding: "2rem 1rem", maxWidth: 820 }}>
      <div className="card pad0">
        <div className="card-head"><h2>{d.page.title}</h2></div>
        <div className="card-body"><div className="prose" dangerouslySetInnerHTML={{ __html: d.page.content_html }} /></div>
      </div>
    </div>
  );
}
