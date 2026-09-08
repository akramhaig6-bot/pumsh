import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../store.jsx";
import { api } from "../lib/api.jsx";
import { Avatar } from "./ui.jsx";

/* =================== غلاف الموقع العام =================== */
export function PublicLayout() {
  const { user, unread, logout } = useApp();
  const [meta, setMeta] = useState(null);
  const [menus, setMenus] = useState([]);
  const loc = useLocation();

  useEffect(() => {
    Promise.all([api("/api/meta"), api("/api/menus")])
      .then(([m, n]) => { setMeta(m.meta); setMenus(n.menus || []); })
      .catch(() => {});
  }, []);

  const links = menus.length
    ? menus.map((m) => {
        const target =
          m.destination === "page" ? `/page/${m.target}` :
          m.destination === "category" ? `/articles?category=${m.target}` :
          m.destination === "section" ? `/#${m.target}` : m.target;
        return { to: target, label: m.name };
      })
    : [
        { to: "/", label: "الرئيسية" },
        { to: "/offers", label: "العروض" },
        { to: "/articles", label: "المقالات" },
        { to: "/page/about", label: "من نحن" },
        { to: "/page/contact", label: "تواصل معنا" },
      ];

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link to="/" className="brand">
            <span className="logo-dot">ن</span>
            <span>{meta?.name || "نَما"}</span>
          </Link>
          <nav className="nav">
            {links.map((l) => (
              <NavLink key={l.to + l.label} to={l.to} className={({ isActive }) => (isActive ? "on" : "")} end={l.to === "/"}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="nav" style={{ marginInlineStart: 0 }}>
            {user ? (
              <>
                <NavLink to={user.role === "admin" ? "/admin" : "/account"}>
                  {user.role === "admin" ? "لوحة الإدارة" : "حسابي"}
                  {unread > 0 && <span className="badge" style={{ marginInlineStart: 6, background: "var(--warn)" }}>{unread}</span>}
                </NavLink>
                <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>خروج</a>
              </>
            ) : (
              <>
                <NavLink to="/login">دخول</NavLink>
                <NavLink to="/register">إنشاء حساب</NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="topbar-m">
        {[...links, ...(user ? [] : [{ to: "/login", label: "دخول" }, { to: "/register", label: "حساب جديد" }])].map((l) => (
          <Link key={l.to + l.label} to={l.to}>{l.label}</Link>
        ))}
        {user && <Link to={user.role === "admin" ? "/admin" : "/account"}>{user.role === "admin" ? "الإدارة" : "حسابي"}</Link>}
      </div>
      <main><Outlet context={{ meta, menus }} /></main>
      <Footer meta={meta} menus={menus} />
    </>
  );
}

function Footer({ meta, menus }) {
  const pages = menus?.filter((m) => m.destination === "page").slice(0, 4) || [];
  const [texts, setTexts] = useState({});
  useEffect(() => { api("/api/texts").then((d) => setTexts(d.texts || {})).catch(() => {}); }, []);
  return (
    <footer className="footer">
      <div className="wrap">
        <div>
          <h3 style={{ color: "#fff" }}>{meta?.name || "نَما"}</h3>
          <p style={{ fontSize: ".92rem" }}>{meta?.description || ""}</p>
          {meta?.email && <p className="small">✉ {meta.email}</p>}
          {meta?.phone && <p className="small">✆ <span className="mono">{meta.phone}</span></p>}
        </div>
        <div>
          <h4 style={{ color: "#d8e8e2" }}>روابط</h4>
          {(menus?.length ? menus : []).slice(0, 6).map((m) => (
            <p key={m.id} className="small" style={{ margin: "0 0 .3em" }}>
              <Link to={m.destination === "page" ? `/page/${m.target}` : m.target}>{m.name}</Link>
            </p>
          ))}
        </div>
        <div>
          <h4 style={{ color: "#d8e8e2" }}>سياسات</h4>
          <p className="small"><Link to="/page/privacy">سياسة الخصوصية</Link></p>
          <p className="small"><Link to="/page/terms">الشروط والأحكام</Link></p>
          <p className="small"><Link to="/page/contact">تواصل معنا</Link></p>
        </div>
      </div>
      <div className="bottom">{(meta?.copyright || "© {year}").replace("{year}", new Date().getFullYear())}</div>
    </footer>
  );
}

/* =================== غلاف حسابات المستخدمين =================== */
export function AccountLayout() {
  const { user, meReady } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (meReady && !user) nav("/login?next=" + encodeURIComponent(loc.pathname));
  }, [meReady, user]);
  if (!meReady) return null;
  if (!user) return null;
  if (user.role === "admin") return <NavigateAdmin />;
  return (
    <div className="wrap" style={{ paddingTop: "1.6rem", paddingBottom: "2rem" }}>
      <div className="grid" style={{ gridTemplateColumns: "260px 1fr", gap: "1.2rem" }} >
        <aside>
          <div className="card center" style={{ marginBottom: "1rem" }}>
            <Avatar name={user.name} />
            <h3 style={{ margin: ".4em 0 0" }}>{user.name}</h3>
            <p className="small muted" style={{ margin: 0 }}>{user.email}</p>
          </div>
          <div className="card pad0">
            <div className="card-body" style={{ padding: ".5rem" }}>
              <SideLink to="/account" end label="نظرة عامة" icon="🧭" />
              <SideLink to="/account/profile" label="بياناتي" icon="👤" />
              <SideLink to="/account/requests" label="طلباتي" icon="📋" />
              <SideLink to="/account/tickets" label="الدعم الفني" icon="🎧" />
              <SideLink to="/account/notifications" label="الإشعارات" icon="🔔" />
            </div>
          </div>
        </aside>
        <div style={{ minWidth: 0 }}><Outlet /></div>
      </div>
      <style>{`@media(max-width:760px){ .grid[style] { grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

function NavigateAdmin() {
  const nav = useNavigate();
  useEffect(() => { nav("/admin", { replace: true }); }, []);
  return null;
}

function SideLink({ to, label, icon, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `btn ${isActive ? "ghost" : "secondary"} sm`}
      style={{ width: "100%", justifyContent: "flex-start", marginBottom: ".3em", textAlign: "right" }}>
      <span>{icon}</span> {label}
    </NavLink>
  );
}

/* =================== غلاف لوحة الإدارة =================== */
const ADMIN_NAV = [
  { grp: "العمليات", items: [
    { to: "/admin", label: "نظرة عامة", icon: "📊", end: true },
    { to: "/admin/requests", label: "الطلبات", icon: "📋" },
    { to: "/admin/tickets", label: "التذاكر", icon: "🎧" },
    { to: "/admin/users", label: "العملاء", icon: "👥" },
  ]},
  { grp: "المحتوى", items: [
    { to: "/admin/offers", label: "العروض", icon: "🏷️" },
    { to: "/admin/articles", label: "المقالات", icon: "📰" },
    { to: "/admin/pages", label: "الصفحات", icon: "📄" },
    { to: "/admin/categories", label: "التصنيفات", icon: "🗄️" },
    { to: "/admin/banners", label: "البانرات", icon: "🖼️" },
    { to: "/admin/menus", label: "القوائم", icon: "🧭" },
    { to: "/admin/texts", label: "النصوص", icon: "✍️" },
    { to: "/admin/media", label: "الوسائط", icon: "📁" },
  ]},
  { grp: "النظام", items: [
    { to: "/admin/settings", label: "الإعدادات", icon: "⚙️" },
    { to: "/admin/notifications", label: "الإشعارات", icon: "🔔" },
    { to: "/admin/events", label: "سجل الأحداث", icon: "🕵️" },
    { to: "/admin/admins", label: "المشرفون", icon: "🛡️" },
    { to: "/admin/me", label: "ملفي الشخصي", icon: "👤" },
  ]},
];

export function AdminLayout() {
  const { user, meReady, unread } = useApp();
  const nav = useNavigate();
  useEffect(() => {
    if (meReady && user && user.role !== "admin") nav("/", { replace: true });
  }, [meReady, user, nav]);
  if (!meReady || !user || user.role !== "admin") return null;
  return (
    <div className="admin">
      <aside className="admin-side">
        <Link to="/admin" className="brand"><span className="logo-dot">ن</span> {user.name}</Link>
        {ADMIN_NAV.map((g) => (
          <div key={g.grp}>
            <div className="grp">{g.grp}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? "on" : "")}>
                {it.icon} {it.label}
                {it.to === "/admin" && unread > 0 ? <span className="badge" style={{ marginInlineStart: 6, background: "var(--warn)" }}>{unread}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
        <a href="#" onClick={(e) => { e.preventDefault(); nav("/"); }}>🌐 عرض الموقع</a>
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  );
}

/* شريط علوي داخل لوحة الإدارة مع بحث/إجراءات مشترك */
export function PageHead({ title, sub, actions }) {
  return (
    <div className="admin-top">
      <div>
        <h1>{title}</h1>
        {sub && <div className="small muted">{sub}</div>}
      </div>
      <div className="flex wrap-any">{actions}</div>
    </div>
  );
}

export function useParamsLazy() {
  return useParams();
}
