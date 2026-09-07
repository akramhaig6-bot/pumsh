import {
  Component,
  createContext,
  FormEvent,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  CircleHelp,
  ClipboardList,
  Clock3,
  Eye,
  FileText,
  Home,
  LayoutDashboard,
  Leaf,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  PackageOpen,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";

type Role = "client" | "admin";
type Status = "draft" | "published" | "unpublished";
type UserT = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  active: boolean;
  createdAt: string;
};
type Offer = {
  id: string;
  title: string;
  summary: string;
  description: string;
  image: string;
  terms?: string;
  start?: string;
  end?: string;
  status: Status;
  createdAt: string;
  updatedAt?: string;
};
type Attachment = { name: string; data: string; type: string; size: number };
type RequestT = {
  id: string;
  offerId: string;
  userId: string;
  notes: string;
  status: string;
  createdAt: string;
  adminNote?: string;
  attachments?: Attachment[];
  infoReply?: string;
  infoAttachments?: Attachment[];
  history?: { status: string; at: string; note?: string }[];
};
type TicketT = {
  id: string;
  userId: string;
  requestId?: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  attachments?: Attachment[];
  replies: { by: Role; text: string; at: string; attachments?: Attachment[] }[];
};
type Article = {
  id: string;
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  image: string;
  categoryId?: string;
  metaTitle?: string;
  metaDescription?: string;
  status: Status;
  createdAt: string;
  updatedAt?: string;
};
type ContentPage = {
  id: string;
  title: string;
  slug: string;
  content: string;
  image: string;
  metaTitle: string;
  metaDescription: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
};
type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
};
type Banner = {
  id: string;
  name: string;
  headline: string;
  subline: string;
  buttonText: string;
  buttonLink: string;
  image: string;
  position: string;
  order: number;
  start: string;
  end: string;
  status: Status;
  createdAt: string;
};
type Media = {
  id: string;
  name: string;
  data: string;
  type: string;
  size: number;
  alt: string;
  description: string;
  createdAt: string;
};
type MenuItem = { id: string; label: string; url: string };
type MenuT = {
  id: string;
  name: string;
  position: "header" | "footer" | "side" | "none";
  items: MenuItem[];
  updatedAt: string;
};
type TextT = {
  key: string;
  group: string;
  description: string;
  value: string;
  defaultValue: string;
};
type Notice = {
  id: string;
  userId: string;
  title: string;
  text: string;
  read: boolean;
  createdAt: string;
  to: string;
  delivery?: "sent" | "failed";
};
type EventT = {
  id: string;
  title: string;
  actor: string;
  createdAt: string;
  entity?: string;
  details?: string;
};
type SettingsT = {
  name: string;
  tagline: string;
  description: string;
  email: string;
  phone: string;
  address: string;
  maintenance: boolean;
  maintenanceMessage: string;
  maintenanceTitle: string;
  returnDate: string;
  maxFileMB: number;
  featuredCount: number;
  articleCount: number;
  pageSize: number;
  copyright: string;
  socials: { type: string; url: string }[];
  homeSections: { id: string; label: string; enabled: boolean }[];
};
type DB = {
  users: UserT[];
  offers: Offer[];
  requests: RequestT[];
  tickets: TicketT[];
  articles: Article[];
  pages: ContentPage[];
  categories: Category[];
  banners: Banner[];
  media: Media[];
  menus: MenuT[];
  texts: TextT[];
  notices: Notice[];
  events: EventT[];
  settings: SettingsT;
};
const defaultTexts: TextT[] = [
  {
    key: "home.offers_title",
    group: "الصفحة الرئيسية",
    description: "عنوان قسم العروض",
    value: "العروض المتاحة",
    defaultValue: "العروض المتاحة",
  },
  {
    key: "home.articles_title",
    group: "الصفحة الرئيسية",
    description: "عنوان قسم المقالات",
    value: "قراءات وأفكار",
    defaultValue: "قراءات وأفكار",
  },
  {
    key: "empty.results",
    group: "رسائل النظام",
    description: "رسالة عدم وجود نتائج",
    value: "لا توجد نتائج مطابقة",
    defaultValue: "لا توجد نتائج مطابقة",
  },
  {
    key: "auth.welcome",
    group: "الحساب",
    description: "رسالة الترحيب",
    value: "مرحباً بك في منصتنا",
    defaultValue: "مرحباً بك في منصتنا",
  },
];
const defaultSettings: SettingsT = {
  name: "نَما",
  tagline: "مساحة أهدأ لفرصٍ أوضح",
  description:
    "منصة تجمع العروض والطلبات في تجربة واضحة، موثوقة، ومصممة حول احتياجك.",
  email: "",
  phone: "",
  address: "",
  maintenance: false,
  maintenanceMessage: "نعمل الآن على تحسين تجربتك. نعود قريباً.",
  maintenanceTitle: "نعود إليك قريباً",
  returnDate: "",
  maxFileMB: 5,
  featuredCount: 6,
  articleCount: 3,
  pageSize: 12,
  copyright: "© {year} جميع الحقوق محفوظة.",
  socials: [],
  homeSections: [
    { id: "offers", label: "العروض المميزة", enabled: true },
    { id: "features", label: "مميزات المنصة", enabled: true },
    { id: "articles", label: "المقالات الحديثة", enabled: true },
  ],
};
const emptyDB: DB = {
  users: [],
  offers: [],
  requests: [],
  tickets: [],
  articles: [],
  pages: [],
  categories: [],
  banners: [],
  media: [],
  menus: [],
  texts: defaultTexts,
  notices: [],
  events: [],
  settings: defaultSettings,
};
const key = "nama_frontend_db_v1",
  sessionKey = "nama_session_v1";
const uid = (p = "ID") =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();
const date = (v: string) =>
  new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(v));
const strongPassword = (v: string) =>
  v.length >= 8 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v);
const offerVisible = (o: Offer) => {
  const d = new Date().toISOString().slice(0, 10);
  return (
    o.status === "published" &&
    (!o.start || o.start <= d) &&
    (!o.end || o.end >= d)
  );
};

interface Ctx {
  db: DB;
  setDB: React.Dispatch<React.SetStateAction<DB>>;
  me?: UserT;
  login: (u: UserT) => void;
  logout: () => void;
  toast: string;
  notify: (s: string) => void;
  log: (title: string, actor?: string) => void;
}
const AppCtx = createContext<Ctx>(null!);
function Provider({ children }: { children: ReactNode }) {
  const [db, setDB] = useState<DB>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      return {
        ...emptyDB,
        ...saved,
        settings: { ...defaultSettings, ...(saved.settings || {}) },
        texts: saved.texts || defaultTexts,
        pages: saved.pages || [],
        categories: saved.categories || [],
        banners: saved.banners || [],
        media: saved.media || [],
        menus: saved.menus || [],
      };
    } catch {
      return emptyDB;
    }
  });
  const [sid, setSid] = useState(() => {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return "";
    try {
      const session = JSON.parse(raw) as { id: string; expires: number };
      if (session.expires <= Date.now()) {
        localStorage.removeItem(sessionKey);
        return "";
      }
      return session.id;
    } catch {
      return raw;
    }
  });
  const [toast, setToast] = useState("");
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(db));
    document.title = `${db.settings.name} | العروض والطلبات`;
  }, [db]);
  const me = db.users.find((u) => u.id === sid && u.active);
  useEffect(() => {
    if (!sid) return;
    const refresh = () =>
      localStorage.setItem(
        sessionKey,
        JSON.stringify({ id: sid, expires: Date.now() + 30 * 60 * 1000 }),
      );
    refresh();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((event) =>
      window.addEventListener(event, refresh, { passive: true }),
    );
    const timer = window.setInterval(() => {
      try {
        const session = JSON.parse(localStorage.getItem(sessionKey) || "{}");
        if (session.expires && session.expires <= Date.now()) {
          localStorage.removeItem(sessionKey);
          setSid("");
          setToast("انتهت جلستك، سجل الدخول مجدداً");
        }
      } catch {
        /* migrate legacy session */
      }
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, refresh));
    };
  }, [sid]);
  const login = (u: UserT) => {
    localStorage.setItem(
      sessionKey,
      JSON.stringify({ id: u.id, expires: Date.now() + 30 * 60 * 1000 }),
    );
    setSid(u.id);
  };
  const logout = () => {
    localStorage.removeItem(sessionKey);
    setSid("");
  };
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2600);
  };
  const log = (title: string, actor = me?.name || "النظام") =>
    setDB((d) => ({
      ...d,
      events: [{ id: uid("EV"), title, actor, createdAt: now() }, ...d.events],
    }));
  return (
    <AppCtx.Provider
      value={{ db, setDB, me, login, logout, toast, notify, log }}
    >
      {children}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white shadow-xl">
          <Check size={17} />
          {toast}
        </div>
      )}
    </AppCtx.Provider>
  );
}
const useApp = () => useContext(AppCtx);

function Logo({ light = false }: { light?: boolean }) {
  const { db } = useApp();
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2 font-bold ${light ? "text-white" : "text-forest"}`}
    >
      <span
        className={`grid size-9 place-items-center rounded-xl ${light ? "bg-white/10" : "bg-forest text-white"}`}
      >
        <Leaf size={19} />
      </span>
      <span className="text-lg">{db.settings.name}</span>
    </Link>
  );
}
function Header() {
  const { me, db, logout } = useApp();
  const [open, setOpen] = useState(false);
  const unread = db.notices.filter(
    (n) => n.userId === me?.id && !n.read,
  ).length;
  const configured = db.menus
    .find((m) => m.position === "header")
    ?.items.map((i) => [i.url, i.label]);
  const nav = configured?.length
    ? configured
    : [
        ["/offers", "العروض"],
        ["/articles", "المجلة"],
        ["/about", "عن المنصة"],
      ];
  return (
    <header className="sticky top-0 z-50 border-b border-forest/10 bg-ivory/90 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex">
          {nav.map(([to, x]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? "text-forest" : "text-ink/60 hover:text-forest"}`
              }
            >
              {x}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {me?.role === "client" ? (
            <>
              <Link className="btn-ghost relative" to="/notifications">
                <Bell size={19} />
                {unread > 0 && (
                  <b className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-forest text-[9px] text-white">
                    {unread}
                  </b>
                )}
              </Link>
              <Link to="/account" className="btn-secondary">
                <User size={17} />
                {me.name.split(" ")[0]}
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                تسجيل الدخول
              </Link>
              <Link to="/register" className="btn-primary">
                إنشاء حساب
              </Link>
            </>
          )}{" "}
          {me?.role === "admin" && (
            <Link to="/admin" className="btn-primary">
              لوحة الإدارة
            </Link>
          )}
        </div>
        <button
          aria-label="القائمة"
          className="btn-ghost md:hidden"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="container-page border-t border-forest/10 py-4 md:hidden">
          <nav className="flex flex-col">
            {nav.map(([to, x]) => (
              <Link
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 font-medium"
                to={to}
                key={to}
              >
                {x}
              </Link>
            ))}
            <div className="mt-3 grid gap-2 border-t border-forest/10 pt-3">
              {me ? (
                <>
                  <Link
                    onClick={() => setOpen(false)}
                    className="btn-secondary"
                    to={me.role === "admin" ? "/admin" : "/account"}
                  >
                    حسابي
                  </Link>
                  <button className="btn-ghost" onClick={logout}>
                    تسجيل الخروج
                  </button>
                </>
              ) : (
                <>
                  <Link className="btn-secondary" to="/login">
                    تسجيل الدخول
                  </Link>
                  <Link className="btn-primary" to="/register">
                    إنشاء حساب
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
function Footer() {
  const { db } = useApp();
  const menu = db.menus.find((m) => m.position === "footer")?.items;
  return (
    <footer className="mt-20 bg-forest text-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo light />
          <p className="mt-5 max-w-md text-sm leading-7 text-white/65">
            {db.settings.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
            {db.settings.email && (
              <a href={`mailto:${db.settings.email}`}>{db.settings.email}</a>
            )}
            {db.settings.phone && (
              <a href={`tel:${db.settings.phone}`}>{db.settings.phone}</a>
            )}
            {db.settings.socials.map((s, i) => (
              <a key={i} target="_blank" rel="noreferrer" href={s.url}>
                {s.type}
              </a>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-bold">استكشف</h3>
          <div className="mt-4 grid gap-3 text-sm text-white/65">
            {(menu?.length
              ? menu
              : [
                  { id: "offers", label: "العروض", url: "/offers" },
                  { id: "articles", label: "المجلة", url: "/articles" },
                  { id: "about", label: "عن المنصة", url: "/about" },
                ]
            ).map((i) => (
              <Link key={i.id} to={i.url}>
                {i.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-bold">حسابك</h3>
          <div className="mt-4 grid gap-3 text-sm text-white/65">
            <Link to="/requests">طلباتي</Link>
            <Link to="/tickets">الدعم</Link>
            <Link to="/admin/login">دخول الإدارة</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page py-5 text-xs text-white/45">
          {db.settings.copyright.replace(
            "{year}",
            String(new Date().getFullYear()),
          )}
        </div>
      </div>
    </footer>
  );
}
function PublicLayout({ children }: { children: ReactNode }) {
  const { db, me } = useApp();
  if (db.settings.maintenance && me?.role !== "admin") return <Maintenance />;
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
function PageHead({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="container-page flex flex-col gap-5 pb-8 pt-10 sm:flex-row sm:items-end sm:justify-between lg:pb-12 lg:pt-16">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title">{title}</h1>
        {desc && <p className="mt-3 max-w-2xl leading-7 text-ink/60">{desc}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({
  icon: Icon = PackageOpen,
  title = "لا توجد عناصر بعد",
  text = "ستظهر العناصر هنا فور إضافتها.",
}: {
  icon?: typeof PackageOpen;
  title?: string;
  text?: string;
}) {
  return (
    <div className="card flex flex-col items-center px-5 py-14 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-forest/5 text-sage">
        <Icon />
      </span>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm text-ink/50">{text}</p>
    </div>
  );
}
function StatusBadge({ s }: { s: string }) {
  const labels: Record<string, string> = {
    draft: "مسودة",
    published: "منشور",
    unpublished: "غير منشور",
    new: "جديد",
    review: "قيد المراجعة",
    info: "بانتظار معلومات",
    info_complete: "مكتمل المعلومات",
    accepted: "مقبول",
    rejected: "مرفوض",
    processing: "قيد التنفيذ",
    completed: "مكتمل",
    cancelled: "ملغي",
    closed: "مغلق",
    open: "مفتوحة",
    waiting_admin: "بانتظار الإدارة",
    waiting_client: "بانتظار العميل",
  };
  return <span className="badge">{labels[s] || s}</span>;
}

function HomePage() {
  const { db } = useApp();
  const visible = (id: string) =>
    db.settings.homeSections.find((s) => s.id === id)?.enabled !== false;
  const offers = db.offers
      .filter(offerVisible)
      .slice(0, db.settings.featuredCount),
    arts = db.articles
      .filter((a) => a.status === "published")
      .slice(0, db.settings.articleCount);
  const t = (k: string, f: string) =>
    db.texts.find((x) => x.key === k)?.value || f;
  const stamp = new Date().toISOString().slice(0, 10);
  const banner = db.banners
    .filter(
      (b) =>
        b.status === "published" &&
        b.position === "hero" &&
        (!b.start || b.start <= stamp) &&
        (!b.end || b.end >= stamp),
    )
    .sort((a, b) => a.order - b.order)[0];
  return (
    <PublicLayout>
      <section className="container-page pt-5 sm:pt-8">
        <div className="relative min-h-[520px] overflow-hidden rounded-[2rem] bg-forest text-white sm:min-h-[570px]">
          <img
            src={banner?.image || "/editorial-hero.jpg"}
            className="absolute inset-0 size-full object-cover opacity-55"
            alt={banner?.name || "مساحة معمارية هادئة"}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-forest via-forest/80 to-transparent" />
          <div className="relative flex min-h-[520px] max-w-3xl flex-col justify-end p-6 pb-10 sm:min-h-[570px] sm:p-12 lg:p-16">
            <span className="mb-6 w-fit rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs backdrop-blur">
              تجربة رقمية أكثر هدوءاً
            </span>
            <h1 className="text-4xl font-bold leading-[1.35] sm:text-5xl lg:text-6xl">
              {banner?.headline || db.settings.tagline}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/75 sm:text-lg">
              {banner?.subline || db.settings.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 min-[400px]:flex-row">
              <Link
                className="btn bg-white text-forest hover:bg-ivory"
                to={banner?.buttonLink || "/offers"}
              >
                {banner?.buttonText || "استكشف العروض"} <ArrowLeft size={17} />
              </Link>
              <Link
                className="btn border border-white/25 text-white hover:bg-white/10"
                to="/register"
              >
                ابدأ الآن
              </Link>
            </div>
          </div>
        </div>
      </section>
      {visible("offers") && (
        <section className="container-page py-16 lg:py-24">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="eyebrow">مختار لك</p>
              <h2 className="section-title">
                {t("home.offers_title", "العروض المتاحة")}
              </h2>
            </div>
            <Link
              className="hidden text-sm font-bold text-forest sm:flex"
              to="/offers"
            >
              عرض الكل
            </Link>
          </div>
          {offers.length ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {offers.map((o) => (
                <OfferCard o={o} key={o.id} />
              ))}
            </div>
          ) : (
            <Empty
              title="نحضّر عروضاً تستحق انتظارك"
              text="لم تُنشر عروض حتى الآن. عُد لزيارتنا قريباً."
            />
          )}
        </section>
      )}
      {visible("features") && (
        <section className="bg-white py-16 lg:py-24">
          <div className="container-page">
            <div className="grid gap-6 lg:grid-cols-3">
              <Feature
                icon={ShieldCheck}
                n="01"
                title="وضوح من البداية"
                text="كل تفاصيل العرض وحالة طلبك في مكان واحد، دون خطوات مبهمة."
              />
              <Feature
                icon={MessageCircle}
                n="02"
                title="تواصل مباشر"
                text="تذاكر دعم مرتبطة بطلباتك لتبقى كل محادثة في سياقها الصحيح."
              />
              <Feature
                icon={Clock3}
                n="03"
                title="متابعة مستمرة"
                text="إشعارات واضحة لكل تحديث مهم يطرأ على طلبك."
              />
            </div>
          </div>
        </section>
      )}
      {visible("articles") && arts.length > 0 && (
        <section className="container-page py-16 lg:py-24">
          <p className="eyebrow">من المجلة</p>
          <h2 className="section-title mb-8">
            {t("home.articles_title", "قراءات وأفكار")}
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {arts.map((a) => (
              <ArticleCard a={a} key={a.id} />
            ))}
          </div>
        </section>
      )}
    </PublicLayout>
  );
}
function Feature({
  icon: Icon,
  n,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  n: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-forest/10 p-7">
      <div className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-xl bg-forest text-white">
          <Icon size={19} />
        </span>
        <span className="text-xs text-sage">{n}</span>
      </div>
      <h3 className="mt-8 text-xl font-bold">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-ink/55">{text}</p>
    </div>
  );
}
function OfferCard({ o }: { o: Offer }) {
  return (
    <Link to={`/offers/${o.id}`} className="card group overflow-hidden">
      <div className="aspect-[4/3] overflow-hidden bg-sand">
        {o.image ? (
          <img
            src={o.image}
            className="size-full object-cover transition duration-500 group-hover:scale-105"
            alt={o.title}
          />
        ) : (
          <div className="grid size-full place-items-center text-sage">
            <Sparkles size={36} />
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="text-lg font-bold">{o.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/55">
          {o.summary}
        </p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-forest">
          عرض التفاصيل <ChevronLeft size={16} />
        </span>
      </div>
    </Link>
  );
}
function OffersPage() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const x = db.offers.filter((o) => offerVisible(o) && o.title.includes(q));
  return (
    <PublicLayout>
      <PageHead
        eyebrow="الفرص المتاحة"
        title="العروض"
        desc="تصفّح العروض المنشورة واختر ما يلائم احتياجك."
      />
      <div className="container-page">
        <div className="relative mb-7 max-w-lg">
          <Search className="absolute right-4 top-3.5 text-ink/35" size={18} />
          <input
            className="input pr-11"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث في العروض..."
          />
        </div>
        {x.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {x.map((o) => (
              <OfferCard o={o} key={o.id} />
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </div>
    </PublicLayout>
  );
}
function OfferDetail() {
  const { id } = useParams(),
    { db } = useApp(),
    o = db.offers.find((x) => x.id === id && offerVisible(x));
  if (!o) return <NotFound />;
  return (
    <PublicLayout>
      <div className="container-page py-8 lg:py-14">
        <Link
          to="/offers"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink/55"
        >
          العودة إلى العروض
        </Link>
        <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
          <div className="overflow-hidden rounded-3xl bg-sand">
            <div className="aspect-[5/4]">
              {o.image ? (
                <img
                  src={o.image}
                  className="size-full object-cover"
                  alt={o.title}
                />
              ) : (
                <div className="grid size-full place-items-center text-sage">
                  <Sparkles size={55} />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <span className="badge w-fit">عرض متاح</span>
            <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl">
              {o.title}
            </h1>
            <p className="mt-5 leading-8 text-ink/60">{o.summary}</p>
            <div className="my-7 h-px bg-forest/10" />
            <div className="whitespace-pre-line leading-8 text-ink/75">
              {o.description}
            </div>
            {o.terms && (
              <div className="mt-6 rounded-xl bg-white/60 p-4">
                <h3 className="font-bold">شروط العرض</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-ink/60">
                  {o.terms}
                </p>
              </div>
            )}
            <Link
              className="btn-primary mt-8 w-full sm:w-fit"
              to={`/apply/${o.id}`}
            >
              تقديم طلب <ArrowLeft size={17} />
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
function Articles() {
  const { db } = useApp();
  const x = db.articles.filter((a) => a.status === "published");
  return (
    <PublicLayout>
      <PageHead
        eyebrow="المجلة"
        title="قراءات ملهمة"
        desc="محتوى منتقى بعناية، يساعدك على اتخاذ قرارات أوضح."
      />
      <div className="container-page">
        {x.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {x.map((a) => (
              <ArticleCard a={a} key={a.id} />
            ))}
          </div>
        ) : (
          <Empty icon={BookOpen} title="لا توجد مقالات منشورة" />
        )}
      </div>
    </PublicLayout>
  );
}
function ArticleCard({ a }: { a: Article }) {
  return (
    <Link className="card overflow-hidden" to={`/articles/${a.id}`}>
      <div className="aspect-[16/10] bg-sand">
        {a.image ? (
          <img src={a.image} className="size-full object-cover" alt="" />
        ) : (
          <div className="grid size-full place-items-center text-sage">
            <BookOpen />
          </div>
        )}
      </div>
      <div className="p-5">
        <span className="text-xs text-sage">{date(a.createdAt)}</span>
        <h2 className="mt-2 text-lg font-bold">{a.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/55">
          {a.excerpt}
        </p>
      </div>
    </Link>
  );
}
function ArticleDetail() {
  const { id } = useParams(),
    { db } = useApp(),
    a = db.articles.find((x) => x.id === id && x.status === "published");
  if (!a) return <NotFound />;
  return (
    <PublicLayout>
      <article className="container-page max-w-4xl py-10">
        <p className="eyebrow">المجلة · {date(a.createdAt)}</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
          {a.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-ink/55">{a.excerpt}</p>
        {a.image && (
          <img
            src={a.image}
            className="my-9 aspect-[16/9] w-full rounded-3xl object-cover"
            alt=""
          />
        )}
        <div className="whitespace-pre-line text-base leading-9 text-ink/75">
          {a.content}
        </div>
      </article>
    </PublicLayout>
  );
}
function About() {
  const { db } = useApp();
  return (
    <PublicLayout>
      <div className="container-page py-12 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">عن المنصة</p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              صُمّمت البساطة
              <br />
              لتعمل لأجلك.
            </h1>
            <p className="mt-6 max-w-xl leading-8 text-ink/60">
              {db.settings.description} نؤمن أن التجربة الممتازة لا تحتاج إلى
              تعقيد؛ بل إلى تفاصيل مدروسة، معلومات واضحة، وتواصل يحترم وقتك.
            </p>
          </div>
          <div className="card p-5">
            <img
              src="/editorial-hero.jpg"
              className="aspect-square w-full rounded-2xl object-cover"
              alt=""
            />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { db, setDB, login, notify, log } = useApp();
  const nav = useNavigate(),
    loc = useLocation();
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    terms: false,
  });
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (f.name.trim().length < 3)
        return setError("الاسم يجب أن يتكون من ثلاثة أحرف على الأقل.");
      if (!/^\S+@\S+\.\S+$/.test(f.email))
        return setError("أدخل بريداً إلكترونياً صالحاً.");
      if (!/^[+\d][\d\s-]{7,}$/.test(f.phone))
        return setError("أدخل رقم جوال صالحاً.");
      if (!strongPassword(f.password))
        return setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      if (f.password !== f.confirm)
        return setError("كلمتا المرور غير متطابقتين.");
      if (!f.terms) return setError("يجب الموافقة على الشروط.");
      if (db.users.some((u) => u.email === f.email))
        return setError("هذا البريد مسجل بالفعل.");
      const u: UserT = {
        id: uid("USR"),
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        phone: f.phone,
        password: f.password,
        role: "client",
        active: true,
        createdAt: now(),
      };
      setDB((d) => ({ ...d, users: [...d.users, u] }));
      login(u);
      log("إنشاء حساب عميل جديد", u.name);
      notify("مرحباً بك، تم إنشاء حسابك");
      nav((loc.state as any)?.from || "/account");
    } else {
      const u = db.users.find(
        (u) =>
          u.email === f.email.trim().toLowerCase() &&
          u.password === f.password &&
          u.role === "client",
      );
      if (!u) return setError("بيانات الدخول غير صحيحة.");
      if (!u.active) return setError("هذا الحساب معطل.");
      login(u);
      log("تسجيل دخول عميل", u.name);
      nav((loc.state as any)?.from || "/account");
    }
  };
  return (
    <PublicLayout>
      <div className="container-page grid min-h-[70vh] place-items-center py-10">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <div className="mb-7">
            <span className="mb-5 grid size-11 place-items-center rounded-xl bg-forest text-white">
              <LockKeyhole size={19} />
            </span>
            <h1 className="text-2xl font-bold">
              {mode === "login" ? "مرحباً بعودتك" : "أنشئ حسابك"}
            </h1>
            <p className="mt-2 text-sm text-ink/50">
              {mode === "login"
                ? "تابع طلباتك وتواصل مع فريق الدعم."
                : "بضع خطوات تفصلك عن تقديم طلبك الأول."}
            </p>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            {mode === "register" && (
              <>
                <Field
                  label="الاسم الكامل"
                  value={f.name}
                  onChange={(v) => setF({ ...f, name: v })}
                />
                <Field
                  label="رقم الجوال"
                  type="tel"
                  value={f.phone}
                  onChange={(v) => setF({ ...f, phone: v })}
                />
              </>
            )}
            <Field
              label="البريد الإلكتروني"
              type="email"
              value={f.email}
              onChange={(v) => setF({ ...f, email: v })}
            />
            <Field
              label="كلمة المرور"
              type="password"
              value={f.password}
              onChange={(v) => setF({ ...f, password: v })}
            />
            {mode === "login" && (
              <Link
                className="text-xs font-semibold text-sage"
                to="/forgot-password"
              >
                نسيت كلمة المرور؟
              </Link>
            )}
            {mode === "register" && (
              <>
                <Field
                  label="تأكيد كلمة المرور"
                  type="password"
                  value={f.confirm}
                  onChange={(v) => setF({ ...f, confirm: v })}
                />
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    className="mt-1 accent-forest"
                    checked={f.terms}
                    onChange={(e) => setF({ ...f, terms: e.target.checked })}
                  />
                  <span>أوافق على الشروط وسياسة الخصوصية.</span>
                </label>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <button className="btn-primary w-full" type="submit">
              {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-ink/55">
            {mode === "login" ? "ليس لديك حساب؟ " : "لديك حساب؟ "}
            <Link
              className="font-bold text-forest"
              to={mode === "login" ? "/register" : "/login"}
            >
              {mode === "login" ? "أنشئ حساباً" : "سجّل الدخول"}
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
function ForgotPassword() {
  const { db, setDB, notify, log } = useApp(),
    [email, setEmail] = useState(""),
    [verified, setVerified] = useState(false),
    [password, setPassword] = useState(""),
    [confirmPw, setConfirmPw] = useState(""),
    [error, setError] = useState("");
  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (
      !db.users.some(
        (u) => u.email === email.toLowerCase() && u.role === "client",
      )
    )
      return setError("لا يوجد حساب مرتبط بهذا البريد.");
    setError("");
    setVerified(true);
  };
  const reset = (e: FormEvent) => {
    e.preventDefault();
    if (!strongPassword(password) || password !== confirmPw)
      return setError("تأكد من قوة كلمة المرور وتطابقها.");
    setDB((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.email === email.toLowerCase() ? { ...u, password } : u,
      ),
    }));
    log("إعادة تعيين كلمة المرور", email);
    notify("تم تحديث كلمة المرور");
    setVerified(false);
    setEmail("");
    setPassword("");
    setConfirmPw("");
  };
  return (
    <PublicLayout>
      <div className="container-page grid min-h-[65vh] place-items-center py-10">
        <form
          onSubmit={verified ? reset : verify}
          className="card grid w-full max-w-md gap-4 p-6 sm:p-8"
        >
          <h1 className="text-2xl font-bold">استعادة كلمة المرور</h1>
          <p className="text-sm leading-6 text-ink/50">
            لأن النظام يعمل دون خادم بريد، يتم التحقق محلياً من الحساب ثم تعيين
            كلمة جديدة على هذا الجهاز.
          </p>
          {!verified ? (
            <Field
              label="البريد الإلكتروني"
              type="email"
              value={email}
              onChange={setEmail}
            />
          ) : (
            <>
              <Field
                label="كلمة المرور الجديدة"
                type="password"
                value={password}
                onChange={setPassword}
              />
              <Field
                label="تأكيد كلمة المرور"
                type="password"
                value={confirmPw}
                onChange={setConfirmPw}
              />
            </>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary">
            {verified ? "حفظ كلمة المرور" : "متابعة"}
          </button>
        </form>
      </div>
    </PublicLayout>
  );
}
function ChangePassword() {
  const { me, setDB, notify, log } = useApp(),
    [old, setOld] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPw, setConfirmPw] = useState(""),
    [error, setError] = useState(""),
    nav = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (old !== me!.password) return setError("كلمة المرور الحالية غير صحيحة.");
    if (!strongPassword(password) || password !== confirmPw)
      return setError("تأكد من قوة كلمة المرور الجديدة وتطابقها.");
    setDB((d) => ({
      ...d,
      users: d.users.map((u) => (u.id === me!.id ? { ...u, password } : u)),
    }));
    log("تغيير كلمة المرور");
    notify("تم تغيير كلمة المرور");
    nav(me!.role === "admin" ? "/admin" : "/account");
  };
  const body = (
    <form onSubmit={submit} className="card grid max-w-xl gap-4 p-5 sm:p-7">
      <Field
        label="كلمة المرور الحالية"
        type="password"
        value={old}
        onChange={setOld}
      />
      <Field
        label="كلمة المرور الجديدة"
        type="password"
        value={password}
        onChange={setPassword}
      />
      <Field
        label="تأكيد كلمة المرور"
        type="password"
        value={confirmPw}
        onChange={setConfirmPw}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-fit">تحديث كلمة المرور</button>
    </form>
  );
  return me!.role === "admin" ? (
    <AdminLayout title="تغيير كلمة المرور">{body}</AdminLayout>
  ) : (
    <AccountLayout title="تغيير كلمة المرور">{body}</AccountLayout>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <input
        className="input"
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function FileUpload({
  files,
  onChange,
  multiple = true,
  imagesOnly = false,
}: {
  files: Attachment[];
  onChange: (f: Attachment[]) => void;
  multiple?: boolean;
  imagesOnly?: boolean;
}) {
  const { db, notify } = useApp();
  const pick = (list: FileList | null) => {
    if (!list) return;
    [...list].forEach((file) => {
      const allowed = imagesOnly
        ? file.type.startsWith("image/")
        : [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ].includes(file.type);
      if (!allowed) return notify("صيغة الملف غير مدعومة");
      if (file.size > db.settings.maxFileMB * 1024 * 1024)
        return notify(`الحد الأقصى ${db.settings.maxFileMB} ميغابايت`);
      const reader = new FileReader();
      reader.onload = () => {
        const item = {
          name: file.name,
          data: String(reader.result),
          type: file.type,
          size: file.size,
        };
        onChange(multiple ? [...files, item] : [item]);
      };
      reader.readAsDataURL(file);
    });
  };
  return (
    <div>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-sage/50 bg-white p-4 text-center">
        <Plus className="mb-2 text-sage" />
        <span className="text-sm font-semibold">
          اختر {imagesOnly ? "صورة" : "ملفاً أو صورة"}
        </span>
        <span className="mt-1 text-xs text-ink/40">
          حتى {db.settings.maxFileMB} MB
        </span>
        <input
          className="hidden"
          type="file"
          accept={
            imagesOnly
              ? "image/png,image/jpeg,image/webp"
              : "image/png,image/jpeg,image/webp,.pdf,.doc,.docx"
          }
          multiple={multiple}
          onChange={(e) => pick(e.target.files)}
        />
      </label>
      {files.length > 0 && (
        <div className="mt-3 grid gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-forest/5 px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate">{f.name}</span>
              <button
                type="button"
                className="text-red-700"
                onClick={() => onChange(files.filter((_, n) => n !== i))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function AttachmentList({ files = [] }: { files?: Attachment[] }) {
  return files.length ? (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((f, i) => (
        <a key={i} download={f.name} href={f.data} className="badge">
          <FileText size={13} />
          {f.name}
        </a>
      ))}
    </div>
  ) : null;
}
function ClientGuard({ children }: { children: ReactNode }) {
  const { me } = useApp(),
    loc = useLocation();
  return me?.role === "client" ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: loc.pathname }} replace />
  );
}
function Apply() {
  const { id } = useParams(),
    { db, setDB, me, notify, log } = useApp(),
    nav = useNavigate(),
    o = db.offers.find((x) => x.id === id && offerVisible(x)),
    draftKey = `nama_apply_draft_${me?.id}_${id}`,
    [notes, setNotes] = useState(() => localStorage.getItem(draftKey) || ""),
    [files, setFiles] = useState<Attachment[]>([]);
  useEffect(() => {
    if (notes) localStorage.setItem(draftKey, notes);
    else localStorage.removeItem(draftKey);
  }, [draftKey, notes]);
  if (!o) return <NotFound />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (
      db.requests.some(
        (r) =>
          r.offerId === o.id &&
          r.userId === me!.id &&
          !["cancelled", "rejected", "closed"].includes(r.status),
      )
    )
      return notify("لديك طلب نشط لهذا العرض بالفعل");
    const r: RequestT = {
      id: uid("REQ"),
      offerId: o.id,
      userId: me!.id,
      notes,
      status: "new",
      createdAt: now(),
      attachments: files,
      history: [{ status: "new", at: now() }],
    };
    setDB((d) => ({
      ...d,
      requests: [r, ...d.requests],
      notices: [
        {
          id: uid("NT"),
          userId: me!.id,
          title: "تم استلام طلبك",
          text: `طلبك على ${o.title} وصل بنجاح.`,
          read: false,
          createdAt: now(),
          to: `/requests/${r.id}`,
        },
        ...d.users
          .filter((u) => u.role === "admin")
          .map((u) => ({
            id: uid("NT"),
            userId: u.id,
            title: "طلب جديد",
            text: `وصل الطلب ${r.id} من ${me!.name}`,
            read: false,
            createdAt: now(),
            to: "/admin/requests",
          })),
        ...d.notices,
      ],
    }));
    localStorage.removeItem(draftKey);
    log(`إنشاء الطلب ${r.id}`);
    notify("تم إرسال طلبك بنجاح");
    nav(`/requests/${r.id}`);
  };
  return (
    <PublicLayout>
      <PageHead
        eyebrow="طلب جديد"
        title={o.title}
        desc="راجع ملخص العرض وأضف أي تفاصيل تساعدنا على فهم احتياجك."
      />
      <form
        onSubmit={submit}
        className="container-page grid gap-6 lg:grid-cols-[1fr_360px]"
      >
        <div className="card p-5 sm:p-7">
          <label className="label">
            ملاحظاتك <span className="font-normal text-ink/40">(اختياري)</span>
          </label>
          <textarea
            className="input min-h-40 resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="اكتب أي تفاصيل إضافية هنا..."
          />
          <div className="mt-5">
            <span className="label">
              المرفقات{" "}
              <span className="font-normal text-ink/40">(اختياري)</span>
            </span>
            <FileUpload files={files} onChange={setFiles} />
          </div>
          <div className="mt-5 rounded-xl bg-forest/5 p-4 text-sm leading-7 text-ink/60">
            بإرسال الطلب، سيظهر فوراً ضمن طلباتك ويمكنك متابعة حالته من حسابك.
          </div>
        </div>
        <aside className="card h-fit p-5">
          <p className="text-xs text-sage">ملخص العرض</p>
          <h2 className="mt-2 font-bold">{o.title}</h2>
          <p className="mt-2 text-sm leading-6 text-ink/50">{o.summary}</p>
          <button className="btn-primary mt-6 w-full">
            تأكيد وإرسال الطلب
          </button>
        </aside>
      </form>
    </PublicLayout>
  );
}
function AccountLayout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const links = [
    ["/account", User, "نظرة عامة"],
    ["/requests", ClipboardList, "طلباتي"],
    ["/tickets", LifeBuoy, "تذاكر الدعم"],
    ["/notifications", Bell, "الإشعارات"],
  ];
  return (
    <PublicLayout>
      <div className="container-page py-8">
        <h1 className="mb-6 text-2xl font-bold">{title}</h1>
        <div className="flex gap-2 overflow-x-auto pb-5 no-scrollbar">
          {links.map(([to, I, x]) => {
            const Icon = I as typeof User;
            return (
              <NavLink
                key={to as string}
                end={to === "/account"}
                to={to as string}
                className={({ isActive }) =>
                  `btn whitespace-nowrap ${isActive ? "bg-forest text-white" : "border border-forest/10 bg-white text-ink/65"}`
                }
              >
                <Icon size={16} />
                {x as string}
              </NavLink>
            );
          })}
        </div>
        {children}
      </div>
    </PublicLayout>
  );
}
function Account() {
  const { me, db, setDB, notify, logout } = useApp(),
    [name, setName] = useState(me!.name),
    [phone, setPhone] = useState(me!.phone),
    [email, setEmail] = useState(me!.email);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      db.users.some((u) => u.id !== me!.id && u.email === email.toLowerCase())
    )
      return notify("البريد غير صالح أو مستخدم بالفعل");
    setDB((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === me!.id ? { ...u, name, phone, email: email.toLowerCase() } : u,
      ),
    }));
    notify("تم حفظ بياناتك");
  };
  return (
    <AccountLayout title="حسابي">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <form onSubmit={save} className="card grid gap-4 p-5 sm:p-7">
          <h2 className="mb-2 text-lg font-bold">البيانات الشخصية</h2>
          <Field label="الاسم الكامل" value={name} onChange={setName} />
          <Field
            label="البريد الإلكتروني"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <Field label="رقم الجوال" value={phone} onChange={setPhone} />
          <button className="btn-primary mt-2 w-fit">حفظ التغييرات</button>
        </form>
        <aside className="card h-fit p-5">
          <h3 className="font-bold">أمان الحساب</h3>
          <p className="mt-2 text-sm leading-6 text-ink/50">
            حافظ على سرية بيانات دخولك، خصوصاً عند استخدام جهاز مشترك.
          </p>
          <Link className="btn-secondary mt-5 w-full" to="/change-password">
            <LockKeyhole size={17} />
            تغيير كلمة المرور
          </Link>
          <button className="btn-secondary mt-2 w-full" onClick={logout}>
            <LogOut size={17} />
            تسجيل الخروج
          </button>
        </aside>
      </div>
    </AccountLayout>
  );
}
function RequestsPage() {
  const { db, me } = useApp(),
    [status, setStatus] = useState("all");
  const all = db.requests.filter((r) => r.userId === me!.id),
    rs = all.filter((r) => status === "all" || r.status === status);
  return (
    <AccountLayout title="طلباتي">
      <div className="mb-5 max-w-xs">
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">كل الحالات</option>
          <option value="new">جديد</option>
          <option value="review">قيد المراجعة</option>
          <option value="info">بانتظار معلومات</option>
          <option value="info_complete">مكتمل المعلومات</option>
          <option value="accepted">مقبول</option>
          <option value="rejected">مرفوض</option>
          <option value="cancelled">ملغي</option>
          <option value="completed">مكتمل</option>
          <option value="closed">مغلق</option>
        </select>
      </div>
      {rs.length ? (
        <div className="grid gap-3">
          {rs.map((r) => {
            const o = db.offers.find((o) => o.id === r.offerId);
            return (
              <Link
                to={`/requests/${r.id}`}
                key={r.id}
                className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="text-xs text-ink/40">
                    {r.id} · {date(r.createdAt)}
                  </span>
                  <h2 className="mt-1 font-bold">
                    {o?.title || "عرض غير متاح"}
                  </h2>
                </div>
                <StatusBadge s={r.status} />
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={ClipboardList}
          title="لا توجد طلبات"
          text="حين تقدم على أحد العروض ستتمكن من متابعة طلبك هنا."
        />
      )}
    </AccountLayout>
  );
}
function RequestDetail() {
  const { id } = useParams(),
    { db, setDB, me, notify } = useApp(),
    r = db.requests.find((x) => x.id === id && x.userId === me!.id);
  if (!r) return <NotFound />;
  const o = db.offers.find((x) => x.id === r.offerId);
  const cancel = () => {
    setDB((d) => ({
      ...d,
      requests: d.requests.map((x) =>
        x.id === r.id ? { ...x, status: "cancelled" } : x,
      ),
    }));
    notify("تم إلغاء الطلب");
  };
  return (
    <AccountLayout title="تفاصيل الطلب">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs text-ink/40">{r.id}</span>
              <h2 className="mt-1 text-xl font-bold">
                {o?.title || "عرض غير متاح"}
              </h2>
            </div>
            <StatusBadge s={r.status} />
          </div>
          <div className="my-6 h-px bg-forest/10" />
          <h3 className="text-sm font-bold">ملاحظات الطلب</h3>
          <p className="mt-2 whitespace-pre-line leading-7 text-ink/60">
            {r.notes || "لم تُضف ملاحظات."}
          </p>
          <AttachmentList files={r.attachments} />
          {r.infoReply && (
            <div className="mt-6">
              <h3 className="text-sm font-bold">المعلومات المستكملة</h3>
              <p className="mt-2 text-sm leading-7">{r.infoReply}</p>
              <AttachmentList files={r.infoAttachments} />
            </div>
          )}
          {r.adminNote && (
            <div className="mt-6 rounded-xl bg-forest/5 p-4">
              <h3 className="text-sm font-bold">رسالة الإدارة</h3>
              <p className="mt-2 text-sm leading-7">{r.adminNote}</p>
            </div>
          )}
          <div className="mt-7 border-t border-forest/10 pt-5">
            <h3 className="mb-4 text-sm font-bold">الخط الزمني</h3>
            <div className="grid gap-3">
              {(r.history || [{ status: r.status, at: r.createdAt }]).map(
                (h, i) => (
                  <div className="flex items-center gap-3 text-sm" key={i}>
                    <span className="size-2 rounded-full bg-sage" />
                    <StatusBadge s={h.status} />
                    <span className="text-xs text-ink/40">{date(h.at)}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
        <aside className="card h-fit p-5">
          <p className="text-xs text-ink/40">تاريخ التقديم</p>
          <p className="mt-1 font-semibold">{date(r.createdAt)}</p>
          {r.status === "info" && (
            <Link
              className="btn-primary mt-5 w-full"
              to={`/requests/${r.id}/complete`}
            >
              استكمال المعلومات
            </Link>
          )}
          <Link
            className="btn-secondary mt-3 w-full"
            to={`/tickets/new?request=${r.id}`}
          >
            طلب المساعدة
          </Link>
          {["new", "info"].includes(r.status) && (
            <button
              className="btn-ghost mt-2 w-full text-red-700"
              onClick={cancel}
            >
              إلغاء الطلب
            </button>
          )}
        </aside>
      </div>
    </AccountLayout>
  );
}
function CompleteRequest() {
  const { id } = useParams(),
    { db, setDB, me, notify, log } = useApp(),
    nav = useNavigate();
  const r = db.requests.find((x) => x.id === id && x.userId === me!.id);
  const [reply, setReply] = useState(""),
    [files, setFiles] = useState<Attachment[]>([]);
  if (!r || r.status !== "info")
    return <Navigate to={`/requests/${id}`} replace />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setDB((d) => ({
      ...d,
      requests: d.requests.map((x) =>
        x.id === r.id
          ? {
              ...x,
              status: "info_complete",
              infoReply: reply,
              infoAttachments: files,
              history: [
                ...(x.history || []),
                { status: "info_complete", at: now() },
              ],
            }
          : x,
      ),
    }));
    log(`استكمال معلومات الطلب ${r.id}`);
    notify("تم إرسال المعلومات بنجاح");
    nav(`/requests/${r.id}`);
  };
  return (
    <AccountLayout title="استكمال معلومات الطلب">
      <form
        onSubmit={submit}
        className="card mx-auto grid max-w-2xl gap-5 p-5 sm:p-7"
      >
        <div className="rounded-xl bg-forest/5 p-4">
          <p className="text-xs text-sage">طلب الإدارة</p>
          <p className="mt-2 leading-7">{r.adminNote}</p>
        </div>
        <label>
          <span className="label">ردك</span>
          <textarea
            required
            className="input min-h-36"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="اكتب المعلومات المطلوبة بالتفصيل..."
          />
        </label>
        <div>
          <span className="label">مرفقات إضافية</span>
          <FileUpload files={files} onChange={setFiles} />
        </div>
        <button className="btn-primary w-fit">إرسال المعلومات</button>
      </form>
    </AccountLayout>
  );
}
function Tickets() {
  const { db, me } = useApp();
  const ts = db.tickets.filter((t) => t.userId === me!.id);
  return (
    <AccountLayout title="تذاكر الدعم">
      <div className="mb-5 flex justify-end">
        <Link className="btn-primary" to="/tickets/new">
          <Plus size={17} />
          تذكرة جديدة
        </Link>
      </div>
      {ts.length ? (
        <div className="grid gap-3">
          {ts.map((t) => (
            <Link
              to={`/tickets/${t.id}`}
              className="card flex items-center justify-between gap-4 p-5"
              key={t.id}
            >
              <div>
                <span className="text-xs text-ink/40">{t.id}</span>
                <h2 className="mt-1 font-bold">{t.subject}</h2>
              </div>
              <StatusBadge s={t.status} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={LifeBuoy} title="لا توجد تذاكر دعم" />
      )}
    </AccountLayout>
  );
}
function NewTicket() {
  const { setDB, db, me, notify, log } = useApp(),
    nav = useNavigate(),
    query = new URLSearchParams(useLocation().search),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [requestId, setRequestId] = useState(query.get("request") || ""),
    [files, setFiles] = useState<Attachment[]>([]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t: TicketT = {
      id: uid("TKT"),
      userId: me!.id,
      requestId: requestId || undefined,
      subject,
      message,
      status: "open",
      createdAt: now(),
      attachments: files,
      replies: [],
    };
    setDB((d) => ({
      ...d,
      tickets: [t, ...d.tickets],
      notices: [
        ...d.users
          .filter((u) => u.role === "admin")
          .map((u) => ({
            id: uid("NT"),
            userId: u.id,
            title: "تذكرة دعم جديدة",
            text: `${t.subject} — ${me!.name}`,
            read: false,
            createdAt: now(),
            to: "/admin/tickets",
          })),
        ...d.notices,
      ],
    }));
    log(`إنشاء تذكرة ${t.id}`);
    notify("تم إنشاء التذكرة");
    nav(`/tickets/${t.id}`);
  };
  return (
    <AccountLayout title="تذكرة دعم جديدة">
      <form
        onSubmit={submit}
        className="card mx-auto grid max-w-2xl gap-5 p-5 sm:p-7"
      >
        <Field label="موضوع التذكرة" value={subject} onChange={setSubject} />
        <label>
          <span className="label">
            ربط بطلب <span className="font-normal text-ink/40">(اختياري)</span>
          </span>
          <select
            className="input"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
          >
            <option value="">تذكرة عامة</option>
            {db.requests
              .filter((r) => r.userId === me!.id)
              .map((r) => (
                <option value={r.id} key={r.id}>
                  {r.id} — {db.offers.find((o) => o.id === r.offerId)?.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="label">اشرح ما تحتاج إليه</span>
          <textarea
            required
            className="input min-h-40"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <div>
          <span className="label">المرفقات</span>
          <FileUpload files={files} onChange={setFiles} />
        </div>
        <button className="btn-primary w-fit">إرسال التذكرة</button>
      </form>
    </AccountLayout>
  );
}
function TicketDetail() {
  const { id } = useParams(),
    { db, setDB, me, notify } = useApp(),
    t = db.tickets.find((x) => x.id === id && x.userId === me!.id),
    [text, setText] = useState("");
  if (!t) return <NotFound />;
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setDB((d) => ({
      ...d,
      tickets: d.tickets.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: "waiting_admin",
              replies: [...x.replies, { by: "client", text, at: now() }],
            }
          : x,
      ),
    }));
    setText("");
    notify("تم إرسال ردك");
  };
  return (
    <AccountLayout title={t.subject}>
      <div className="card mx-auto max-w-3xl p-5 sm:p-7">
        <div className="mb-6 flex justify-between">
          <span className="text-xs text-ink/40">{t.id}</span>
          <StatusBadge s={t.status} />
        </div>
        <ChatBubble who="client" text={t.message} at={t.createdAt} />
        <AttachmentList files={t.attachments} />
        {t.replies.map((r, i) => (
          <div key={i}>
            <ChatBubble who={r.by} text={r.text} at={r.at} />
            <AttachmentList files={r.attachments} />
          </div>
        ))}
        <form
          onSubmit={send}
          className="mt-7 flex flex-col gap-3 border-t border-forest/10 pt-5 sm:flex-row"
        >
          <textarea
            className="input min-h-24 flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب ردك..."
          />
          <button className="btn-primary self-end">
            {t.status === "closed" ? "إعادة فتح وإرسال" : "إرسال"}
          </button>
        </form>
      </div>
    </AccountLayout>
  );
}
function ChatBubble({
  who,
  text,
  at,
}: {
  who: Role;
  text: string;
  at: string;
}) {
  return (
    <div
      className={`mb-3 max-w-[90%] rounded-2xl p-4 text-sm leading-7 ${who === "admin" ? "mr-auto bg-forest text-white" : "bg-sand/60"}`}
    >
      <p>{text}</p>
      <span
        className={`mt-2 block text-[10px] ${who === "admin" ? "text-white/50" : "text-ink/35"}`}
      >
        {who === "admin" ? "فريق الدعم" : "أنت"} · {date(at)}
      </span>
    </div>
  );
}
function Notifications() {
  const { db, setDB, me } = useApp();
  const ns = db.notices.filter((n) => n.userId === me!.id);
  const read = (n: Notice) =>
    setDB((d) => ({
      ...d,
      notices: d.notices.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
    }));
  return (
    <AccountLayout title="الإشعارات">
      {ns.some((n) => !n.read) && (
        <div className="mb-4 flex justify-end">
          <button
            className="btn-secondary"
            onClick={() =>
              setDB((d) => ({
                ...d,
                notices: d.notices.map((n) =>
                  n.userId === me!.id ? { ...n, read: true } : n,
                ),
              }))
            }
          >
            تحديد الكل كمقروء
          </button>
        </div>
      )}
      {ns.length ? (
        <div className="grid gap-3">
          {ns.map((n) => (
            <Link
              onClick={() => read(n)}
              to={n.to}
              key={n.id}
              className={`card p-5 ${!n.read ? "border-r-4 border-r-forest" : "opacity-70"}`}
            >
              <div className="flex items-start gap-3">
                <Bell size={18} className="mt-1 shrink-0 text-sage" />
                <div>
                  <h2 className="font-bold">{n.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-ink/55">{n.text}</p>
                  <span className="mt-2 block text-xs text-ink/35">
                    {date(n.createdAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={Bell} title="لا توجد إشعارات" />
      )}
    </AccountLayout>
  );
}

const adminNav = [
  ["/admin", LayoutDashboard, "لوحة التحكم"],
  ["/admin/offers", Sparkles, "العروض"],
  ["/admin/requests", ClipboardList, "الطلبات"],
  ["/admin/users", Users, "العملاء"],
  ["/admin/tickets", LifeBuoy, "تذاكر الدعم"],
  ["/admin/articles", BookOpen, "المقالات"],
  ["/admin/pages", FileText, "الصفحات"],
  ["/admin/categories", PackageOpen, "التصنيفات"],
  ["/admin/banners", Eye, "البنرات"],
  ["/admin/media", PackageOpen, "مكتبة الوسائط"],
  ["/admin/menus", Menu, "القوائم"],
  ["/admin/texts", Pencil, "النصوص العامة"],
  ["/admin/admins", ShieldCheck, "المديرون"],
  ["/admin/notifications", Bell, "الإشعارات"],
  ["/admin/home", Home, "الصفحة الرئيسية"],
  ["/admin/settings", Settings, "الإعدادات"],
  ["/admin/events", FileText, "سجل الأحداث"],
] as const;
function AdminGuard({ children }: { children: ReactNode }) {
  const { me } = useApp();
  return me?.role === "admin" ? (
    children
  ) : (
    <Navigate to="/admin/login" replace />
  );
}
function AdminLogin() {
  const { db, setDB, login, notify } = useApp(),
    nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" }),
    [error, setError] = useState("");
  const admins = db.users.filter((u) => u.role === "admin");
  const setup = admins.length === 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (setup) {
      if (f.name.length < 3 || !strongPassword(f.password))
        return setError("أدخل اسماً صالحاً وكلمة مرور من 8 أحرف على الأقل.");
      const u: UserT = {
        id: uid("ADM"),
        name: f.name,
        email: f.email.toLowerCase(),
        phone: "",
        password: f.password,
        role: "admin",
        active: true,
        createdAt: now(),
      };
      setDB((d) => ({ ...d, users: [...d.users, u] }));
      login(u);
      notify("تم إعداد حساب الإدارة");
      nav("/admin");
    } else {
      const u = admins.find(
        (x) =>
          x.email === f.email.toLowerCase() &&
          x.password === f.password &&
          x.active,
      );
      if (!u) return setError("بيانات الدخول غير صحيحة.");
      login(u);
      nav("/admin");
    }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-forest p-4">
      <div className="w-full max-w-md rounded-3xl bg-ivory p-6 sm:p-8">
        <Logo />
        <div className="my-7">
          <p className="eyebrow">لوحة الإدارة</p>
          <h1 className="text-2xl font-bold">
            {setup ? "إعداد المدير الأول" : "تسجيل الدخول"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink/50">
            {setup
              ? "لا توجد حسابات إدارية بعد. أنشئ الحساب المحلي الأول لإدارة المنصة."
              : "أدخل بيانات حساب الإدارة للمتابعة."}
          </p>
        </div>
        <form className="grid gap-4" onSubmit={submit}>
          {setup && (
            <Field
              label="الاسم الكامل"
              value={f.name}
              onChange={(v) => setF({ ...f, name: v })}
            />
          )}
          <Field
            label="البريد الإلكتروني"
            type="email"
            value={f.email}
            onChange={(v) => setF({ ...f, email: v })}
          />
          <Field
            label="كلمة المرور"
            type="password"
            value={f.password}
            onChange={(v) => setF({ ...f, password: v })}
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary">
            {setup ? "إنشاء حساب الإدارة" : "الدخول إلى اللوحة"}
          </button>
        </form>
      </div>
    </div>
  );
}
function AdminLayout({
  children,
  title,
  action,
}: {
  children: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  const { me, db, logout } = useApp();
  const [open, setOpen] = useState(false),
    nav = useNavigate();
  const out = () => {
    logout();
    nav("/admin/login");
  };
  return (
    <div className="min-h-screen bg-[#f3f1ea]">
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 overflow-y-auto bg-forest p-5 pb-24 text-white transition lg:translate-x-0 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <Logo light />
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <nav className="mt-9 grid gap-1">
          {adminNav.map(([to, I, x]) => (
            <NavLink
              key={to}
              end={to === "/admin"}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${isActive ? "bg-white text-forest" : "text-white/65 hover:bg-white/10 hover:text-white"}`
              }
            >
              <I size={18} />
              {x}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={out}
          className="absolute bottom-6 right-5 flex items-center gap-3 text-sm text-white/60"
        >
          <LogOut size={17} />
          تسجيل الخروج
        </button>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="lg:pr-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-forest/10 bg-[#f3f1ea]/90 px-4 backdrop-blur sm:px-7">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-sm text-ink/50">مساحة الإدارة</span>
            {db.settings.maintenance && (
              <Link
                to="/admin/settings"
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800"
              >
                وضع الصيانة مفعل
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin/notifications" className="btn-ghost relative">
              <Bell size={18} />
              {db.notices.some((n) => n.userId === me?.id && !n.read) && (
                <span className="absolute left-2 top-2 size-2 rounded-full bg-red-600" />
              )}
            </Link>
            <span className="text-sm font-bold">{me?.name}</span>
            <Link
              title="تغيير كلمة المرور"
              to="/admin/change-password"
              className="grid size-9 place-items-center rounded-xl bg-white"
            >
              <User size={17} />
            </Link>
          </div>
        </header>
        <main className="p-4 sm:p-7 lg:p-10">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">إدارة المنصة</p>
              <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  icon: I,
}: {
  label: string;
  value: number;
  icon: typeof User;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-forest/5 text-forest">
          <I size={19} />
        </span>
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-5 text-sm text-ink/50">{label}</p>
    </div>
  );
}
function Dashboard() {
  const { db } = useApp();
  return (
    <AdminLayout title="لوحة التحكم">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Sparkles} label="العروض" value={db.offers.length} />
        <Stat icon={ClipboardList} label="الطلبات" value={db.requests.length} />
        <Stat
          icon={Users}
          label="العملاء"
          value={db.users.filter((u) => u.role === "client").length}
        />
        <Stat
          icon={LifeBuoy}
          label="التذاكر المفتوحة"
          value={db.tickets.filter((t) => t.status !== "closed").length}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-bold">أحدث الطلبات</h2>
          <div className="mt-4 grid gap-2">
            {db.requests.slice(0, 5).map((r) => (
              <Link
                to="/admin/requests"
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-ivory p-3 text-sm"
              >
                <span>{r.id}</span>
                <StatusBadge s={r.status} />
              </Link>
            ))}
            {!db.requests.length && (
              <p className="py-8 text-center text-sm text-ink/40">
                لا توجد طلبات بعد.
              </p>
            )}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-bold">آخر الأنشطة</h2>
          <div className="mt-4 grid gap-3">
            {db.events.slice(0, 5).map((e) => (
              <div key={e.id} className="border-r-2 border-sage pr-3 text-sm">
                <p className="font-medium">{e.title}</p>
                <span className="text-xs text-ink/35">
                  {e.actor} · {date(e.createdAt)}
                </span>
              </div>
            ))}
            {!db.events.length && (
              <p className="py-8 text-center text-sm text-ink/40">
                لا يوجد نشاط مسجل.
              </p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
function AdminOffers() {
  const { db, setDB, notify, log } = useApp();
  const [edit, setEdit] = useState<Offer | null>(null),
    blank = {
      title: "",
      summary: "",
      description: "",
      image: "",
      terms: "",
      start: "",
      end: "",
      status: "draft" as Status,
    },
    [form, setForm] = useState(blank),
    [show, setShow] = useState(false),
    [preview, setPreview] = useState<Offer | null>(null);
  const open = (o?: Offer) => {
    setEdit(o || null);
    setForm(
      o
        ? {
            title: o.title,
            summary: o.summary,
            description: o.description,
            image: o.image,
            terms: o.terms || "",
            start: o.start || "",
            end: o.end || "",
            status: o.status,
          }
        : blank,
    );
    setShow(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 5 || form.summary.trim().length < 20)
      return notify("العنوان لا يقل عن 5 أحرف والوصف المختصر عن 20 حرفاً");
    if (form.end && form.start && form.end < form.start)
      return notify("تاريخ النهاية يجب أن يلي البداية");
    if (
      edit &&
      ((edit.status === "draft" && form.status === "unpublished") ||
        (edit.status !== "draft" && form.status === "draft"))
    )
      return notify("انتقال حالة العرض غير مسموح");
    if (edit)
      setDB((d) => ({
        ...d,
        offers: d.offers.map((o) => (o.id === edit.id ? { ...o, ...form } : o)),
      }));
    else
      setDB((d) => ({
        ...d,
        offers: [{ id: uid("OFF"), ...form, createdAt: now() }, ...d.offers],
      }));
    log(edit ? "تعديل عرض" : "إنشاء عرض");
    notify("تم حفظ العرض");
    setShow(false);
  };
  const del = (id: string) => {
    const target = db.offers.find((o) => o.id === id);
    if (target?.status !== "draft" || db.requests.some((r) => r.offerId === id))
      return notify("لا يحذف إلا العرض المسودة غير المرتبط بطلبات");
    if (!confirm("هل تريد حذف هذا العرض؟")) return;
    setDB((d) => ({ ...d, offers: d.offers.filter((o) => o.id !== id) }));
    notify("تم حذف العرض");
  };
  return (
    <AdminLayout
      title="إدارة العروض"
      action={
        <button className="btn-primary" onClick={() => open()}>
          <Plus size={17} />
          عرض جديد
        </button>
      }
    >
      {db.offers.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {db.offers.map((o) => (
            <div className="card overflow-hidden" key={o.id}>
              <div className="aspect-[16/9] bg-sand">
                {o.image ? (
                  <img src={o.image} className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-sage">
                    <Sparkles />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold">{o.title}</h2>
                  <StatusBadge s={o.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink/50">
                  {o.summary}
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    className="btn-secondary"
                    aria-label="معاينة"
                    onClick={() => setPreview(o)}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="btn-secondary flex-1"
                    onClick={() => open(o)}
                  >
                    <Pencil size={15} />
                    تعديل
                  </button>
                  <button
                    aria-label="حذف"
                    className="btn-ghost text-red-700"
                    onClick={() => del(o.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="لا توجد عروض"
          text="أنشئ عرضك الأول، ثم انشره ليظهر في الواجهة العامة."
        />
      )}
      {show && (
        <Modal
          title={edit ? "تعديل العرض" : "عرض جديد"}
          close={() => setShow(false)}
        >
          <form onSubmit={save} className="grid gap-4">
            <Field
              label="عنوان العرض"
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
            />
            <label>
              <span className="label">الوصف المختصر</span>
              <textarea
                required
                className="input min-h-24"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </label>
            <label>
              <span className="label">التفاصيل</span>
              <textarea
                required
                className="input min-h-36"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              <span className="label">
                شروط العرض{" "}
                <span className="font-normal text-ink/40">(اختياري)</span>
              </span>
              <textarea
                className="input min-h-24"
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
              />
            </label>
            <Field
              label="رابط الصورة"
              type="url"
              value={form.image}
              onChange={(v) => setForm({ ...form, image: v })}
              placeholder="https://..."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="تاريخ البداية"
                type="date"
                required={false}
                value={form.start}
                onChange={(start) => setForm({ ...form, start })}
              />
              <Field
                label="تاريخ النهاية"
                type="date"
                required={false}
                value={form.end}
                onChange={(end) => setForm({ ...form, end })}
              />
            </div>
            <label>
              <span className="label">حالة النشر</span>
              <select
                className="input"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as Status })
                }
              >
                <option value="draft">مسودة</option>
                <option value="published">منشور</option>
                <option value="unpublished">غير منشور</option>
              </select>
            </label>
            <button className="btn-primary">حفظ العرض</button>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal title="معاينة العرض" close={() => setPreview(null)}>
          <div className="overflow-hidden rounded-2xl bg-white">
            <div className="aspect-[16/9] bg-sand">
              {preview.image && (
                <img
                  src={preview.image}
                  alt={preview.title}
                  className="size-full object-cover"
                />
              )}
            </div>
            <div className="p-5">
              <StatusBadge s={preview.status} />
              <h2 className="mt-3 text-2xl font-bold">{preview.title}</h2>
              <p className="mt-3 leading-7 text-ink/60">{preview.summary}</p>
              <div className="mt-5 whitespace-pre-line leading-8">
                {preview.description}
              </div>
              {preview.terms && (
                <div className="mt-5 rounded-xl bg-ivory p-4 text-sm">
                  {preview.terms}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] grid items-end bg-black/35 sm:place-items-center sm:p-5"
      onMouseDown={close}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-ivory p-5 sm:max-w-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="btn-ghost" onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function AdminRequests() {
  const { db, setDB, notify } = useApp();
  const [active, setActive] = useState<RequestT | null>(null);
  const update = (r: RequestT, status: string, note?: string) => {
    setDB((d) => ({
      ...d,
      requests: d.requests.map((x) =>
        x.id === r.id
          ? {
              ...x,
              status,
              adminNote: note || x.adminNote,
              history: [...(x.history || []), { status, at: now(), note }],
            }
          : x,
      ),
      notices: [
        {
          id: uid("NT"),
          userId: r.userId,
          title: "تحديث على طلبك",
          text: `تغيرت حالة الطلب ${r.id}.`,
          read: false,
          createdAt: now(),
          to: `/requests/${r.id}`,
        },
        ...d.notices,
      ],
    }));
    notify("تم تحديث الطلب");
    setActive(null);
  };
  return (
    <AdminLayout title="إدارة الطلبات">
      {db.requests.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead className="bg-forest/5 text-ink/50">
              <tr>
                <th className="p-4">رقم الطلب</th>
                <th>العميل</th>
                <th>العرض</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {db.requests.map((r) => (
                <tr key={r.id} className="border-t border-forest/10">
                  <td className="p-4 font-semibold">{r.id}</td>
                  <td>{db.users.find((u) => u.id === r.userId)?.name}</td>
                  <td>
                    {db.offers.find((o) => o.id === r.offerId)?.title ||
                      "محذوف"}
                  </td>
                  <td>{date(r.createdAt)}</td>
                  <td>
                    <StatusBadge s={r.status} />
                  </td>
                  <td>
                    <button className="btn-ghost" onClick={() => setActive(r)}>
                      إدارة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={ClipboardList} title="لا توجد طلبات" />
      )}
      {active && (
        <RequestAdminModal
          r={active}
          close={() => setActive(null)}
          update={update}
        />
      )}
    </AdminLayout>
  );
}
function RequestAdminModal({
  r,
  close,
  update,
}: {
  r: RequestT;
  close: () => void;
  update: (r: RequestT, s: string, n?: string) => void;
}) {
  const { db } = useApp(),
    [note, setNote] = useState(r.adminNote || "");
  const transitions: Record<string, string[][]> = {
    new: [
      ["review", "بدء المراجعة"],
      ["cancelled", "إلغاء"],
    ],
    review: [
      ["info", "طلب معلومات"],
      ["accepted", "قبول"],
      ["rejected", "رفض"],
      ["cancelled", "إلغاء"],
    ],
    info_complete: [
      ["review", "إعادة المراجعة"],
      ["info", "طلب معلومات أخرى"],
      ["accepted", "قبول"],
      ["rejected", "رفض"],
      ["cancelled", "إلغاء"],
    ],
    accepted: [
      ["completed", "إكمال"],
      ["cancelled", "إلغاء"],
    ],
    completed: [["closed", "إغلاق"]],
  };
  return (
    <Modal title={`إدارة الطلب ${r.id}`} close={close}>
      <div className="rounded-xl bg-white p-4 text-sm">
        <p>
          <b>العميل:</b> {db.users.find((u) => u.id === r.userId)?.name}
        </p>
        <p className="mt-2">
          <b>ملاحظاته:</b> {r.notes || "—"}
        </p>
      </div>
      <label className="mt-5 block">
        <span className="label">رسالة للعميل</span>
        <textarea
          className="input min-h-28"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(transitions[r.status] || []).map(([s, x]) => (
          <button
            key={s}
            className="btn-secondary"
            onClick={() => update(r, s, note)}
          >
            {x}
          </button>
        ))}
      </div>
    </Modal>
  );
}
function AdminUsers() {
  const { db, setDB, notify } = useApp();
  const users = db.users.filter((u) => u.role === "client");
  const reset = (u: UserT) => {
    const password = prompt("أدخل كلمة مرور مؤقتة قوية (حرف كبير وصغير ورقم)");
    if (!password) return;
    if (!strongPassword(password))
      return notify("كلمة المرور لا تستوفي المتطلبات");
    setDB((d) => ({
      ...d,
      users: d.users.map((x) => (x.id === u.id ? { ...x, password } : x)),
    }));
    notify("تمت إعادة تعيين كلمة المرور");
  };
  return (
    <AdminLayout title="إدارة العملاء">
      {users.length ? (
        <div className="grid gap-3">
          {users.map((u) => (
            <div
              className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              key={u.id}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-forest/5">
                  <User size={19} />
                </span>
                <div>
                  <h2 className="font-bold">{u.name}</h2>
                  <p className="text-sm text-ink/45">
                    {u.email} · {u.phone}
                  </p>
                  <p className="mt-1 text-xs text-ink/35">
                    {db.requests.filter((r) => r.userId === u.id).length} طلب ·{" "}
                    {db.tickets.filter((t) => t.userId === u.id).length} تذكرة ·
                    منذ {date(u.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => reset(u)}>
                  كلمة مرور مؤقتة
                </button>
                <button
                  className={`btn ${u.active ? "border border-red-200 text-red-700" : "bg-forest text-white"}`}
                  onClick={() => {
                    setDB((d) => ({
                      ...d,
                      users: d.users.map((x) =>
                        x.id === u.id ? { ...x, active: !x.active } : x,
                      ),
                    }));
                    notify(u.active ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
                  }}
                >
                  {u.active ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={Users} title="لا يوجد عملاء مسجلون" />
      )}
    </AdminLayout>
  );
}
function AdminTickets() {
  const { db, setDB, notify } = useApp();
  const [active, setActive] = useState<TicketT | null>(null),
    [text, setText] = useState("");
  const send = () => {
    if (!active || !text.trim()) return;
    setDB((d) => ({
      ...d,
      tickets: d.tickets.map((t) =>
        t.id === active.id
          ? {
              ...t,
              status: "waiting_client",
              replies: [...t.replies, { by: "admin", text, at: now() }],
            }
          : t,
      ),
      notices: [
        {
          id: uid("NT"),
          userId: active.userId,
          title: "رد جديد من الدعم",
          text: `وصل رد جديد على تذكرتك: ${active.subject}`,
          read: false,
          createdAt: now(),
          to: `/tickets/${active.id}`,
        },
        ...d.notices,
      ],
    }));
    notify("تم إرسال الرد");
    setActive(null);
    setText("");
  };
  return (
    <AdminLayout title="تذاكر الدعم">
      {db.tickets.length ? (
        <div className="grid gap-3">
          {db.tickets.map((t) => (
            <button
              onClick={() => setActive(t)}
              className="card flex items-center justify-between p-5 text-right"
              key={t.id}
            >
              <div>
                <span className="text-xs text-ink/40">{t.id}</span>
                <h2 className="font-bold">{t.subject}</h2>
              </div>
              <StatusBadge s={t.status} />
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={LifeBuoy} title="لا توجد تذاكر" />
      )}
      {active && (
        <Modal title={active.subject} close={() => setActive(null)}>
          <ChatBubble
            who="client"
            text={active.message}
            at={active.createdAt}
          />
          {active.replies.map((r, i) => (
            <ChatBubble key={i} who={r.by} text={r.text} at={r.at} />
          ))}
          <textarea
            className="input mt-5 min-h-28"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب رد الإدارة..."
          />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1" onClick={send}>
              إرسال الرد
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setDB((d) => ({
                  ...d,
                  tickets: d.tickets.map((t) =>
                    t.id === active.id ? { ...t, status: "closed" } : t,
                  ),
                }));
                setActive(null);
              }}
            >
              إغلاق التذكرة
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminArticles() {
  const { db, setDB, notify } = useApp();
  const blank = {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    image: "",
    categoryId: "",
    metaTitle: "",
    metaDescription: "",
    status: "draft" as Status,
  };
  const [form, setForm] = useState(blank),
    [edit, setEdit] = useState<Article | null>(null),
    [show, setShow] = useState(false);
  const open = (a?: Article) => {
    setEdit(a || null);
    setForm(
      a
        ? {
            title: a.title,
            slug: a.slug || "",
            excerpt: a.excerpt,
            content: a.content,
            image: a.image,
            categoryId: a.categoryId || "",
            metaTitle: a.metaTitle || "",
            metaDescription: a.metaDescription || "",
            status: a.status,
          }
        : blank,
    );
    setShow(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    setDB((d) => ({
      ...d,
      articles: edit
        ? d.articles.map((a) => (a.id === edit.id ? { ...a, ...form } : a))
        : [{ id: uid("ART"), ...form, createdAt: now() }, ...d.articles],
    }));
    notify("تم حفظ المقال");
    setShow(false);
  };
  return (
    <AdminLayout
      title="إدارة المقالات"
      action={
        <button className="btn-primary" onClick={() => open()}>
          <Plus size={17} />
          مقال جديد
        </button>
      }
    >
      {db.articles.length ? (
        <div className="grid gap-3">
          {db.articles.map((a) => (
            <div
              key={a.id}
              className="card flex items-center justify-between gap-4 p-5"
            >
              <div>
                <h2 className="font-bold">{a.title}</h2>
                <StatusBadge s={a.status} />
              </div>
              <div className="flex">
                <button className="btn-ghost" onClick={() => open(a)}>
                  <Pencil size={17} />
                </button>
                <button
                  className="btn-ghost text-red-700"
                  onClick={() =>
                    setDB((d) => ({
                      ...d,
                      articles: d.articles.filter((x) => x.id !== a.id),
                    }))
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={BookOpen} title="لا توجد مقالات" />
      )}
      {show && (
        <Modal
          title={edit ? "تعديل المقال" : "مقال جديد"}
          close={() => setShow(false)}
        >
          <form onSubmit={save} className="grid gap-4">
            <Field
              label="العنوان"
              value={form.title}
              onChange={(v) =>
                setForm({
                  ...form,
                  title: v,
                  slug: form.slug || v.replace(/\s+/g, "-"),
                })
              }
            />
            <Field
              label="الرابط المختصر"
              value={form.slug}
              onChange={(slug) => setForm({ ...form, slug })}
            />
            <label>
              <span className="label">التصنيف</span>
              <select
                className="input"
                value={form.categoryId}
                onChange={(e) =>
                  setForm({ ...form, categoryId: e.target.value })
                }
              >
                <option value="">بدون تصنيف</option>
                {db.categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">المقدمة</span>
              <textarea
                required
                className="input min-h-24"
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
            </label>
            <label>
              <span className="label">المحتوى</span>
              <textarea
                required
                className="input min-h-52"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </label>
            <Field
              label="رابط الصورة"
              required={false}
              type="url"
              value={form.image}
              onChange={(v) => setForm({ ...form, image: v })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="عنوان SEO"
                required={false}
                value={form.metaTitle}
                onChange={(metaTitle) => setForm({ ...form, metaTitle })}
              />
              <Field
                label="وصف SEO"
                required={false}
                value={form.metaDescription}
                onChange={(metaDescription) =>
                  setForm({ ...form, metaDescription })
                }
              />
            </div>
            <select
              className="input"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as Status })
              }
            >
              <option value="draft">مسودة</option>
              <option value="published">منشور</option>
              <option value="unpublished">غير منشور</option>
            </select>
            <button className="btn-primary">حفظ المقال</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminSettings() {
  const { db, setDB, notify } = useApp();
  const [s, setS] = useState(db.settings);
  const save = (e: FormEvent) => {
    e.preventDefault();
    setDB((d) => ({ ...d, settings: s }));
    notify("تم حفظ الإعدادات");
  };
  return (
    <AdminLayout title="إعدادات المنصة">
      <form onSubmit={save} className="card grid max-w-3xl gap-5 p-5 sm:p-7">
        <Field
          label="اسم المنصة"
          value={s.name}
          onChange={(v) => setS({ ...s, name: v })}
        />
        <Field
          label="العبارة الرئيسية"
          value={s.tagline}
          onChange={(v) => setS({ ...s, tagline: v })}
        />
        <label>
          <span className="label">الوصف العام</span>
          <textarea
            className="input min-h-28"
            value={s.description}
            onChange={(e) => setS({ ...s, description: e.target.value })}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="بريد التواصل"
            type="email"
            required={false}
            value={s.email}
            onChange={(v) => setS({ ...s, email: v })}
          />
          <Field
            label="رقم التواصل"
            required={false}
            value={s.phone}
            onChange={(v) => setS({ ...s, phone: v })}
          />
        </div>
        <Field
          label="العنوان"
          required={false}
          value={s.address}
          onChange={(address) => setS({ ...s, address })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="أقصى حجم ملف MB"
            type="number"
            value={String(s.maxFileMB)}
            onChange={(v) => setS({ ...s, maxFileMB: Number(v) })}
          />
          <Field
            label="العروض المميزة"
            type="number"
            value={String(s.featuredCount)}
            onChange={(v) => setS({ ...s, featuredCount: Number(v) })}
          />
          <Field
            label="المقالات الحديثة"
            type="number"
            value={String(s.articleCount)}
            onChange={(v) => setS({ ...s, articleCount: Number(v) })}
          />
        </div>
        <Field
          label="نص حقوق النشر"
          value={s.copyright}
          onChange={(copyright) => setS({ ...s, copyright })}
        />
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="label">روابط التواصل الاجتماعي</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setS({
                  ...s,
                  socials: [...s.socials, { type: "أخرى", url: "" }],
                })
              }
            >
              <Plus size={15} />
              إضافة
            </button>
          </div>
          <div className="grid gap-2">
            {s.socials.map((x, i) => (
              <div className="grid grid-cols-[120px_1fr_auto] gap-2" key={i}>
                <select
                  className="input"
                  value={x.type}
                  onChange={(e) =>
                    setS({
                      ...s,
                      socials: s.socials.map((a, n) =>
                        n === i ? { ...a, type: e.target.value } : a,
                      ),
                    })
                  }
                >
                  <option>فيسبوك</option>
                  <option>إنستغرام</option>
                  <option>إكس</option>
                  <option>لينكدإن</option>
                  <option>يوتيوب</option>
                  <option>أخرى</option>
                </select>
                <input
                  className="input"
                  type="url"
                  value={x.url}
                  placeholder="https://"
                  onChange={(e) =>
                    setS({
                      ...s,
                      socials: s.socials.map((a, n) =>
                        n === i ? { ...a, url: e.target.value } : a,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setS({ ...s, socials: s.socials.filter((_, n) => n !== i) })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-forest/10 p-4">
          <label className="flex items-center justify-between gap-3 font-bold">
            <span>وضع الصيانة</span>
            <input
              type="checkbox"
              className="size-5 accent-forest"
              checked={s.maintenance}
              onChange={(e) => setS({ ...s, maintenance: e.target.checked })}
            />
          </label>
          <div className="mt-4 grid gap-3">
            <Field
              label="عنوان الصيانة"
              value={s.maintenanceTitle}
              onChange={(maintenanceTitle) => setS({ ...s, maintenanceTitle })}
            />
            <textarea
              className="input min-h-24"
              value={s.maintenanceMessage}
              onChange={(e) =>
                setS({ ...s, maintenanceMessage: e.target.value })
              }
            />
            <Field
              label="التاريخ المتوقع للعودة"
              type="date"
              required={false}
              value={s.returnDate}
              onChange={(returnDate) => setS({ ...s, returnDate })}
            />
          </div>
        </div>
        <button className="btn-primary w-fit">حفظ الإعدادات</button>
      </form>
    </AdminLayout>
  );
}
function Events() {
  const { db } = useApp(),
    [q, setQ] = useState("");
  const events = db.events.filter((e) =>
    `${e.title}${e.actor}${e.entity || ""}`.includes(q),
  );
  const exportCsv = () => {
    const csv =
      "الحدث,الفاعل,التاريخ\n" +
      events
        .map((e) => `"${e.title}","${e.actor}","${e.createdAt}"`)
        .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv" }),
    );
    a.download = "events.csv";
    a.click();
  };
  return (
    <AdminLayout
      title="سجل الأحداث"
      action={
        <button className="btn-secondary" onClick={exportCsv}>
          تصدير CSV
        </button>
      }
    >
      <input
        className="input mb-5 max-w-md"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="بحث في الحدث أو الفاعل..."
      />
      {events.length ? (
        <div className="card overflow-hidden">
          {events.map((e) => (
            <div
              className="flex flex-col gap-1 border-b border-forest/10 p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              key={e.id}
            >
              <div>
                <p className="font-semibold">{e.title}</p>
                <span className="text-xs text-ink/40">بواسطة {e.actor}</span>
              </div>
              <span className="text-xs text-ink/35">{date(e.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={FileText} title="سجل الأحداث فارغ" />
      )}
    </AdminLayout>
  );
}
function AdminPages() {
  const { db, setDB, notify, log } = useApp();
  const blank = {
      title: "",
      slug: "",
      content: "",
      image: "",
      metaTitle: "",
      metaDescription: "",
      status: "draft" as Status,
    },
    [form, setForm] = useState(blank),
    [edit, setEdit] = useState<ContentPage | null>(null),
    [show, setShow] = useState(false);
  const open = (p?: ContentPage) => {
    setEdit(p || null);
    setForm(
      p
        ? {
            title: p.title,
            slug: p.slug,
            content: p.content,
            image: p.image,
            metaTitle: p.metaTitle,
            metaDescription: p.metaDescription,
            status: p.status,
          }
        : blank,
    );
    setShow(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const slug = form.slug.trim().replace(/\s+/g, "-");
    if (db.pages.some((p) => p.slug === slug && p.id !== edit?.id))
      return notify("الرابط مستخدم في صفحة أخرى");
    const data = { ...form, slug, updatedAt: now() };
    setDB((d) => ({
      ...d,
      pages: edit
        ? d.pages.map((p) => (p.id === edit.id ? { ...p, ...data } : p))
        : [{ id: uid("PG"), ...data, createdAt: now() }, ...d.pages],
    }));
    log(edit ? "تعديل صفحة" : "إنشاء صفحة");
    notify("تم حفظ الصفحة");
    setShow(false);
  };
  const remove = (id: string) => {
    const page = db.pages.find((p) => p.id === id);
    if (!page) return;
    const linked = db.menus.some((m) =>
      m.items.some((i) => i.url === `/pages/${page.slug}`),
    );
    if (
      linked &&
      !confirm(
        "هذه الصفحة مرتبطة بقائمة. سيبقى الرابط في القائمة ويقود إلى 404. متابعة؟",
      )
    )
      return;
    setDB((d) => ({ ...d, pages: d.pages.filter((p) => p.id !== id) }));
    log("حذف صفحة");
    notify("تم حذف الصفحة");
  };
  return (
    <AdminLayout
      title="إدارة الصفحات"
      action={
        <button className="btn-primary" onClick={() => open()}>
          <Plus size={17} />
          صفحة جديدة
        </button>
      }
    >
      {db.pages.length ? (
        <AdminRows
          rows={db.pages.map((p) => ({
            id: p.id,
            title: p.title,
            sub: `/${p.slug}`,
            status: p.status,
          }))}
          onEdit={(id) => open(db.pages.find((p) => p.id === id))}
          onDelete={remove}
        />
      ) : (
        <Empty icon={FileText} title="لا توجد صفحات" />
      )}
      {show && (
        <Modal
          title={edit ? "تعديل الصفحة" : "صفحة جديدة"}
          close={() => setShow(false)}
        >
          <form onSubmit={save} className="grid gap-4">
            <Field
              label="عنوان الصفحة"
              value={form.title}
              onChange={(v) =>
                setForm({
                  ...form,
                  title: v,
                  slug: form.slug || v.trim().replace(/\s+/g, "-"),
                })
              }
            />
            <Field
              label="الرابط المختصر"
              value={form.slug}
              onChange={(v) => setForm({ ...form, slug: v })}
            />
            <label>
              <span className="label">المحتوى</span>
              <textarea
                className="input min-h-60"
                required
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </label>
            <Field
              label="رابط الصورة الرئيسية"
              required={false}
              value={form.image}
              onChange={(v) => setForm({ ...form, image: v })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="عنوان SEO"
                required={false}
                value={form.metaTitle}
                onChange={(v) => setForm({ ...form, metaTitle: v })}
              />
              <Field
                label="وصف SEO"
                required={false}
                value={form.metaDescription}
                onChange={(v) => setForm({ ...form, metaDescription: v })}
              />
            </div>
            <PublishSelect
              value={form.status}
              change={(status) => setForm({ ...form, status })}
            />
            <button className="btn-primary">حفظ الصفحة</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminRows({
  rows,
  onEdit,
  onDelete,
}: {
  rows: { id: string; title: string; sub: string; status?: string }[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-4 border-b border-forest/10 p-4 last:border-0"
        >
          <div className="min-w-0">
            <h2 className="truncate font-bold">{r.title}</h2>
            <p className="truncate text-xs text-ink/40">{r.sub}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {r.status && <StatusBadge s={r.status} />}
            <button className="btn-ghost" onClick={() => onEdit(r.id)}>
              <Pencil size={16} />
            </button>
            <button
              className="btn-ghost text-red-700"
              onClick={() => confirm("تأكيد الحذف؟") && onDelete(r.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
function PublishSelect({
  value,
  change,
}: {
  value: Status;
  change: (s: Status) => void;
}) {
  return (
    <label>
      <span className="label">حالة النشر</span>
      <select
        className="input"
        value={value}
        onChange={(e) => change(e.target.value as Status)}
      >
        <option value="draft">مسودة</option>
        <option value="published">منشور</option>
        <option value="unpublished">غير منشور</option>
      </select>
    </label>
  );
}
function AdminCategories() {
  const { db, setDB, notify } = useApp(),
    [show, setShow] = useState(false),
    [edit, setEdit] = useState<Category | null>(null),
    [f, setF] = useState({ name: "", slug: "", description: "" });
  const open = (c?: Category) => {
    setEdit(c || null);
    setF(
      c
        ? { name: c.name, slug: c.slug, description: c.description }
        : { name: "", slug: "", description: "" },
    );
    setShow(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (db.categories.some((c) => c.slug === f.slug && c.id !== edit?.id))
      return notify("الرابط مستخدم");
    setDB((d) => ({
      ...d,
      categories: edit
        ? d.categories.map((c) => (c.id === edit.id ? { ...c, ...f } : c))
        : [{ id: uid("CAT"), ...f, createdAt: now() }, ...d.categories],
    }));
    notify("تم حفظ التصنيف");
    setShow(false);
  };
  const del = (id: string) =>
    setDB((d) => ({
      ...d,
      categories: d.categories.filter((c) => c.id !== id),
      articles: d.articles.map((a) =>
        a.categoryId === id ? { ...a, categoryId: undefined } : a,
      ),
    }));
  return (
    <AdminLayout
      title="التصنيفات"
      action={
        <button className="btn-primary" onClick={() => open()}>
          <Plus size={17} />
          تصنيف جديد
        </button>
      }
    >
      {db.categories.length ? (
        <AdminRows
          rows={db.categories.map((c) => ({
            id: c.id,
            title: c.name,
            sub: `/${c.slug} · ${db.articles.filter((a) => a.categoryId === c.id).length} مقال`,
          }))}
          onEdit={(id) => open(db.categories.find((c) => c.id === id))}
          onDelete={del}
        />
      ) : (
        <Empty title="لا توجد تصنيفات" />
      )}
      {show && (
        <Modal title="بيانات التصنيف" close={() => setShow(false)}>
          <form onSubmit={save} className="grid gap-4">
            <Field
              label="الاسم"
              value={f.name}
              onChange={(name) =>
                setF({ ...f, name, slug: f.slug || name.replace(/\s+/g, "-") })
              }
            />
            <Field
              label="الرابط"
              value={f.slug}
              onChange={(slug) => setF({ ...f, slug })}
            />
            <Field
              label="الوصف"
              required={false}
              value={f.description}
              onChange={(description) => setF({ ...f, description })}
            />
            <button className="btn-primary">حفظ</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminBanners() {
  const { db, setDB, notify } = useApp();
  const blank = {
      name: "",
      headline: "",
      subline: "",
      buttonText: "",
      buttonLink: "",
      image: "",
      position: "hero",
      order: 1,
      start: "",
      end: "",
      status: "draft" as Status,
    },
    [f, setF] = useState(blank),
    [edit, setEdit] = useState<Banner | null>(null),
    [show, setShow] = useState(false);
  const open = (b?: Banner) => {
    setEdit(b || null);
    setF(
      b
        ? {
            name: b.name,
            headline: b.headline,
            subline: b.subline,
            buttonText: b.buttonText,
            buttonLink: b.buttonLink,
            image: b.image,
            position: b.position,
            order: b.order,
            start: b.start,
            end: b.end,
            status: b.status,
          }
        : blank,
    );
    setShow(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (f.end && f.start && f.end < f.start)
      return notify("تاريخ النهاية يجب أن يلي البداية");
    setDB((d) => ({
      ...d,
      banners: edit
        ? d.banners.map((b) => (b.id === edit.id ? { ...b, ...f } : b))
        : [{ id: uid("BAN"), ...f, createdAt: now() }, ...d.banners],
    }));
    notify("تم حفظ البنر");
    setShow(false);
  };
  return (
    <AdminLayout
      title="البنرات"
      action={
        <button className="btn-primary" onClick={() => open()}>
          <Plus size={17} />
          بنر جديد
        </button>
      }
    >
      {db.banners.length ? (
        <AdminRows
          rows={db.banners.map((b) => ({
            id: b.id,
            title: b.name,
            sub: `${b.position} · ترتيب ${b.order}`,
            status: b.status,
          }))}
          onEdit={(id) => open(db.banners.find((b) => b.id === id))}
          onDelete={(id) =>
            setDB((d) => ({
              ...d,
              banners: d.banners.filter((b) => b.id !== id),
            }))
          }
        />
      ) : (
        <Empty icon={Eye} title="لا توجد بنرات" />
      )}
      {show && (
        <Modal title="بيانات البنر" close={() => setShow(false)}>
          <form onSubmit={save} className="grid gap-4">
            <Field
              label="الاسم الداخلي"
              value={f.name}
              onChange={(name) => setF({ ...f, name })}
            />
            <Field
              label="العنوان الظاهر"
              value={f.headline}
              onChange={(headline) => setF({ ...f, headline })}
            />
            <Field
              label="النص الفرعي"
              required={false}
              value={f.subline}
              onChange={(subline) => setF({ ...f, subline })}
            />
            <Field
              label="رابط الصورة"
              type="url"
              value={f.image}
              onChange={(image) => setF({ ...f, image })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="نص الزر"
                required={false}
                value={f.buttonText}
                onChange={(buttonText) => setF({ ...f, buttonText })}
              />
              <Field
                label="رابط الزر"
                required={false}
                value={f.buttonLink}
                onChange={(buttonLink) => setF({ ...f, buttonLink })}
              />
              <Field
                label="تاريخ البداية"
                type="date"
                required={false}
                value={f.start}
                onChange={(start) => setF({ ...f, start })}
              />
              <Field
                label="تاريخ النهاية"
                type="date"
                required={false}
                value={f.end}
                onChange={(end) => setF({ ...f, end })}
              />
              <Field
                label="الترتيب"
                type="number"
                value={String(f.order)}
                onChange={(order) => setF({ ...f, order: Number(order) })}
              />
            </div>
            <PublishSelect
              value={f.status}
              change={(status) => setF({ ...f, status })}
            />
            <button className="btn-primary">حفظ البنر</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminMedia() {
  const { db, setDB, notify } = useApp();
  const upload = (list: FileList | null) => {
    if (!list) return;
    [...list].forEach((file) => {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf")
        return notify("صيغة غير مدعومة");
      if (file.size > db.settings.maxFileMB * 1024 * 1024)
        return notify("حجم الملف أكبر من المسموح");
      const rd = new FileReader();
      rd.onload = () =>
        setDB((d) => ({
          ...d,
          media: [
            {
              id: uid("MED"),
              name: file.name,
              data: String(rd.result),
              type: file.type,
              size: file.size,
              alt: "",
              description: "",
              createdAt: now(),
            },
            ...d.media,
          ],
        }));
      rd.readAsDataURL(file);
    });
    notify("تمت إضافة الملفات");
  };
  const editMeta = (m: Media) => {
    const alt = prompt("النص البديل للصورة", m.alt) ?? m.alt;
    const description = prompt("وصف الملف", m.description) ?? m.description;
    setDB((d) => ({
      ...d,
      media: d.media.map((x) =>
        x.id === m.id ? { ...x, alt, description } : x,
      ),
    }));
    notify("تم تحديث بيانات الملف");
  };
  return (
    <AdminLayout
      title="مكتبة الوسائط"
      action={
        <label className="btn-primary cursor-pointer">
          <Plus size={17} />
          رفع ملفات
          <input
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
      }
    >
      {db.media.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {db.media.map((m) => (
            <div className="card overflow-hidden" key={m.id}>
              <div className="aspect-square bg-sand">
                {m.type.startsWith("image/") ? (
                  <img
                    src={m.data}
                    className="size-full object-cover"
                    alt={m.alt}
                  />
                ) : (
                  <div className="grid size-full place-items-center">
                    <FileText />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-bold">{m.name}</p>
                <p className="text-[10px] text-ink/35">
                  {(m.size / 1024).toFixed(0)} KB
                </p>
                <button
                  className="ml-3 mt-2 text-xs font-bold text-forest"
                  onClick={() => editMeta(m)}
                >
                  بيانات الملف
                </button>
                <button
                  className="mt-2 text-xs text-red-700"
                  onClick={() =>
                    confirm("حذف الملف؟") &&
                    setDB((d) => ({
                      ...d,
                      media: d.media.filter((x) => x.id !== m.id),
                    }))
                  }
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="مكتبة الوسائط فارغة" />
      )}
    </AdminLayout>
  );
}
function AdminMenus() {
  const { db, setDB, notify } = useApp();
  const [edit, setEdit] = useState<MenuT | null>(null),
    [show, setShow] = useState(false),
    [name, setName] = useState(""),
    [position, setPosition] = useState<MenuT["position"]>("none"),
    [items, setItems] = useState<MenuItem[]>([]);
  const open = (m?: MenuT) => {
    setEdit(m || null);
    setName(m?.name || "");
    setPosition(m?.position || "none");
    setItems(m?.items || []);
    setShow(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const menu: MenuT = {
      id: edit?.id || uid("MNU"),
      name,
      position,
      items,
      updatedAt: now(),
    };
    setDB((d) => ({
      ...d,
      menus: edit
        ? d.menus.map((m) => (m.id === edit.id ? menu : m))
        : [menu, ...d.menus].map((m) =>
            m.id !== menu.id && m.position === position && position !== "none"
              ? { ...m, position: "none" }
              : m,
          ),
    }));
    notify("تم حفظ القائمة");
    setShow(false);
  };
  return (
    <AdminLayout
      title="إدارة القوائم"
      action={
        <button className="btn-primary" onClick={() => open()}>
          <Plus size={17} />
          قائمة جديدة
        </button>
      }
    >
      {db.menus.length ? (
        <AdminRows
          rows={db.menus.map((m) => ({
            id: m.id,
            title: m.name,
            sub: `${m.position} · ${m.items.length} عناصر`,
          }))}
          onEdit={(id) => open(db.menus.find((m) => m.id === id))}
          onDelete={(id) =>
            setDB((d) => ({ ...d, menus: d.menus.filter((m) => m.id !== id) }))
          }
        />
      ) : (
        <Empty icon={Menu} title="لا توجد قوائم" />
      )}
      {show && (
        <Modal title="تحرير القائمة" close={() => setShow(false)}>
          <form onSubmit={save} className="grid gap-4">
            <Field label="اسم القائمة" value={name} onChange={setName} />
            <label>
              <span className="label">الموضع</span>
              <select
                className="input"
                value={position}
                onChange={(e) =>
                  setPosition(e.target.value as MenuT["position"])
                }
              >
                <option value="none">غير مخصصة</option>
                <option value="header">الهيدر</option>
                <option value="footer">الفوتر</option>
                <option value="side">جانبية</option>
              </select>
            </label>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label">عناصر القائمة</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setItems([...items, { id: uid("MI"), label: "", url: "/" }])
                  }
                >
                  <Plus size={15} />
                  عنصر
                </button>
              </div>
              <div className="grid gap-2">
                {items.map((i, n) => (
                  <div
                    className="grid grid-cols-[1fr_1fr_auto] gap-2"
                    key={i.id}
                  >
                    <input
                      className="input"
                      placeholder="النص"
                      value={i.label}
                      onChange={(e) =>
                        setItems(
                          items.map((x, k) =>
                            k === n ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="الرابط"
                      value={i.url}
                      onChange={(e) =>
                        setItems(
                          items.map((x, k) =>
                            k === n ? { ...x, url: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, k) => k !== n))}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-primary">حفظ القائمة</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminTexts() {
  const { db, setDB, notify } = useApp(),
    [q, setQ] = useState("");
  const rows = db.texts.filter((t) => `${t.key}${t.value}`.includes(q));
  return (
    <AdminLayout title="النصوص العامة">
      <div className="mb-5 max-w-md">
        <input
          className="input"
          placeholder="ابحث بالمفتاح أو القيمة..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="grid gap-3">
        {rows.map((t) => (
          <div className="card p-5" key={t.key}>
            <p className="text-xs font-bold text-sage">
              {t.key} · {t.group}
            </p>
            <p className="mt-1 text-xs text-ink/40">{t.description}</p>
            <textarea
              className="input mt-3 min-h-24"
              value={t.value}
              onChange={(e) =>
                setDB((d) => ({
                  ...d,
                  texts: d.texts.map((x) =>
                    x.key === t.key ? { ...x, value: e.target.value } : x,
                  ),
                }))
              }
            />
            <div className="mt-2 flex gap-2">
              <button
                className="btn-primary"
                onClick={() => notify("تم حفظ النص")}
              >
                حفظ
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  setDB((d) => ({
                    ...d,
                    texts: d.texts.map((x) =>
                      x.key === t.key ? { ...x, value: x.defaultValue } : x,
                    ),
                  }))
                }
              >
                استعادة الافتراضي
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
function AdminAdmins() {
  const { db, setDB, me, notify } = useApp(),
    [show, setShow] = useState(false),
    [f, setF] = useState({ name: "", email: "", password: "" });
  const admins = db.users.filter((u) => u.role === "admin");
  const create = (e: FormEvent) => {
    e.preventDefault();
    if (
      !strongPassword(f.password) ||
      db.users.some((u) => u.email === f.email.toLowerCase())
    )
      return notify("تحقق من البريد وقوة كلمة المرور");
    setDB((d) => ({
      ...d,
      users: [
        ...d.users,
        {
          id: uid("ADM"),
          name: f.name,
          email: f.email.toLowerCase(),
          phone: "",
          password: f.password,
          role: "admin",
          active: true,
          createdAt: now(),
        },
      ],
    }));
    notify("تم إنشاء حساب المدير");
    setShow(false);
  };
  const toggle = (a: UserT) => {
    if (a.id === me!.id) return notify("لا يمكنك تعطيل حسابك الحالي");
    if (a.active && admins.filter((x) => x.active).length === 1)
      return notify("لا يمكن تعطيل آخر مدير نشط");
    setDB((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === a.id ? { ...u, active: !u.active } : u,
      ),
    }));
  };
  return (
    <AdminLayout
      title="المستخدمون الإداريون"
      action={
        <button className="btn-primary" onClick={() => setShow(true)}>
          <Plus size={17} />
          مدير جديد
        </button>
      }
    >
      <div className="grid gap-3">
        {admins.map((a) => (
          <div
            className="card flex items-center justify-between p-5"
            key={a.id}
          >
            <div>
              <h2 className="font-bold">
                {a.name}
                {a.id === me!.id && " (أنت)"}
              </h2>
              <p className="text-sm text-ink/45">{a.email}</p>
            </div>
            <button className="btn-secondary" onClick={() => toggle(a)}>
              {a.active ? "تعطيل" : "تفعيل"}
            </button>
          </div>
        ))}
      </div>
      {show && (
        <Modal title="إنشاء مدير" close={() => setShow(false)}>
          <form onSubmit={create} className="grid gap-4">
            <Field
              label="الاسم"
              value={f.name}
              onChange={(name) => setF({ ...f, name })}
            />
            <Field
              label="البريد"
              type="email"
              value={f.email}
              onChange={(email) => setF({ ...f, email })}
            />
            <Field
              label="كلمة المرور المؤقتة"
              type="password"
              value={f.password}
              onChange={(password) => setF({ ...f, password })}
            />
            <button className="btn-primary">إنشاء الحساب</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
function AdminNotifications() {
  const { db, setDB, me } = useApp(),
    nav = useNavigate(),
    [q, setQ] = useState(""),
    [scope, setScope] = useState<"mine" | "all">("mine");
  const ns = db.notices.filter(
    (n) =>
      (scope === "all" || n.userId === me?.id) &&
      `${n.title}${n.text}`.includes(q),
  );
  const open = (n: Notice) => {
    setDB((d) => ({
      ...d,
      notices: d.notices.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
    }));
    nav(n.to);
  };
  return (
    <AdminLayout title="إدارة الإشعارات">
      <div className="mb-4 flex gap-2">
        <button
          className={scope === "mine" ? "btn-primary" : "btn-secondary"}
          onClick={() => setScope("mine")}
        >
          إشعاراتي
        </button>
        <button
          className={scope === "all" ? "btn-primary" : "btn-secondary"}
          onClick={() => setScope("all")}
        >
          جميع الإشعارات
        </button>
      </div>
      <input
        className="input mb-5 max-w-md"
        placeholder="بحث في الإشعارات..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {ns.length ? (
        <div className="card overflow-hidden">
          {ns.map((n) => (
            <button
              type="button"
              onClick={() => open(n)}
              className="flex w-full items-start justify-between gap-4 border-b border-forest/10 p-4 text-right"
              key={n.id}
            >
              <div>
                <h2 className="font-bold">{n.title}</h2>
                <p className="text-sm text-ink/50">{n.text}</p>
                <span className="text-xs text-ink/35">
                  إلى:{" "}
                  {db.users.find((u) => u.id === n.userId)?.name ||
                    "مستخدم غير متاح"}
                </span>
              </div>
              <span className="badge">
                {n.delivery === "failed"
                  ? "فشل الإرسال"
                  : n.read
                    ? "مقروء"
                    : "تم الإرسال"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={Bell} title="لا توجد إشعارات" />
      )}
    </AdminLayout>
  );
}
function AdminHome() {
  const { db, setDB, notify } = useApp();
  const toggle = (id: string) =>
    setDB((d) => ({
      ...d,
      settings: {
        ...d.settings,
        homeSections: d.settings.homeSections.map((s) =>
          s.id === id ? { ...s, enabled: !s.enabled } : s,
        ),
      },
    }));
  return (
    <AdminLayout
      title="إدارة الصفحة الرئيسية"
      action={
        <Link target="_blank" className="btn-secondary" to="/">
          <Eye size={17} />
          معاينة
        </Link>
      }
    >
      <div className="card p-5">
        <p className="mb-5 text-sm text-ink/50">
          فعّل الأقسام أو أخفها. إعداد البنر يتم من قسم البنرات.
        </p>
        <div className="grid gap-3">
          {db.settings.homeSections.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-forest/10 p-4"
            >
              <div>
                <h2 className="font-bold">{s.label}</h2>
                <span className="text-xs text-ink/40">
                  {s.enabled ? "ظاهر حالياً" : "مخفي"}
                </span>
              </div>
              <button
                className={`btn ${s.enabled ? "bg-forest text-white" : "btn-secondary"}`}
                onClick={() => {
                  toggle(s.id);
                  notify("تم تحديث القسم");
                }}
              >
                {s.enabled ? "تعطيل" : "تفعيل"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
function ContentPageView() {
  const { slug } = useParams(),
    { db } = useApp(),
    p = db.pages.find((x) => x.slug === slug && x.status === "published");
  useEffect(() => {
    if (p) document.title = `${p.metaTitle || p.title} | ${db.settings.name}`;
  }, [p, db.settings.name]);
  if (!p) return <NotFound />;
  return (
    <PublicLayout>
      <article className="container-page max-w-4xl py-12">
        {p.image && (
          <img
            src={p.image}
            className="mb-8 aspect-[16/8] w-full rounded-3xl object-cover"
            alt=""
          />
        )}
        <h1 className="text-3xl font-bold sm:text-5xl">{p.title}</h1>
        <div className="mt-8 whitespace-pre-line leading-9 text-ink/70">
          {p.content}
        </div>
      </article>
    </PublicLayout>
  );
}
function Maintenance() {
  const { db } = useApp();
  return (
    <div className="grid min-h-screen place-items-center bg-forest p-5 text-white">
      <div className="max-w-lg text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/10">
          <Settings />
        </span>
        <h1 className="mt-7 text-3xl font-bold">
          {db.settings.maintenanceTitle}
        </h1>
        <p className="mt-4 leading-8 text-white/65">
          {db.settings.maintenanceMessage}
        </p>
        {db.settings.returnDate && (
          <p className="mt-3 text-sm text-white/50">
            العودة المتوقعة: {date(db.settings.returnDate)}
          </p>
        )}
        <Link
          to="/admin/login"
          className="mt-8 inline-block text-xs text-white/30"
        >
          دخول الإدارة
        </Link>
      </div>
    </div>
  );
}
function NotFound() {
  return (
    <PublicLayout>
      <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
        <div>
          <span className="text-7xl font-bold text-sage/30">404</span>
          <h1 className="mt-4 text-2xl font-bold">هذه الصفحة غير موجودة</h1>
          <p className="mt-3 text-ink/50">ربما تغير الرابط أو نُقل المحتوى.</p>
          <Link to="/" className="btn-primary mt-7">
            <Home size={17} />
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Application error", error);
  }
  render() {
    if (this.state.failed)
      return (
        <div className="grid min-h-screen place-items-center bg-ivory p-5 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-forest text-white">
              <CircleHelp />
            </span>
            <h1 className="mt-6 text-2xl font-bold">تعذر عرض الصفحة</h1>
            <p className="mt-2 text-sm text-ink/50">
              حدث خطأ غير متوقع. بياناتك المحلية ما زالت محفوظة.
            </p>
            <button
              className="btn-primary mt-6"
              onClick={() => window.location.assign("/")}
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}

function AppRoutes() {
  return (
    <Provider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/offers/:id" element={<OfferDetail />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:id" element={<ArticleDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/change-password"
          element={
            <ClientGuard>
              <ChangePassword />
            </ClientGuard>
          }
        />
        <Route
          path="/apply/:id"
          element={
            <ClientGuard>
              <Apply />
            </ClientGuard>
          }
        />
        <Route
          path="/account"
          element={
            <ClientGuard>
              <Account />
            </ClientGuard>
          }
        />
        <Route
          path="/requests"
          element={
            <ClientGuard>
              <RequestsPage />
            </ClientGuard>
          }
        />
        <Route
          path="/requests/:id/complete"
          element={
            <ClientGuard>
              <CompleteRequest />
            </ClientGuard>
          }
        />
        <Route
          path="/requests/:id"
          element={
            <ClientGuard>
              <RequestDetail />
            </ClientGuard>
          }
        />
        <Route
          path="/tickets"
          element={
            <ClientGuard>
              <Tickets />
            </ClientGuard>
          }
        />
        <Route
          path="/tickets/new"
          element={
            <ClientGuard>
              <NewTicket />
            </ClientGuard>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <ClientGuard>
              <TicketDetail />
            </ClientGuard>
          }
        />
        <Route
          path="/notifications"
          element={
            <ClientGuard>
              <Notifications />
            </ClientGuard>
          }
        />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <Dashboard />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/offers"
          element={
            <AdminGuard>
              <AdminOffers />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/requests"
          element={
            <AdminGuard>
              <AdminRequests />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminGuard>
              <AdminUsers />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/tickets"
          element={
            <AdminGuard>
              <AdminTickets />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/articles"
          element={
            <AdminGuard>
              <AdminArticles />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/pages"
          element={
            <AdminGuard>
              <AdminPages />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <AdminGuard>
              <AdminCategories />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/banners"
          element={
            <AdminGuard>
              <AdminBanners />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/media"
          element={
            <AdminGuard>
              <AdminMedia />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/menus"
          element={
            <AdminGuard>
              <AdminMenus />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/texts"
          element={
            <AdminGuard>
              <AdminTexts />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/admins"
          element={
            <AdminGuard>
              <AdminAdmins />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <AdminGuard>
              <AdminNotifications />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/home"
          element={
            <AdminGuard>
              <AdminHome />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/change-password"
          element={
            <AdminGuard>
              <ChangePassword />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <AdminGuard>
              <AdminSettings />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/events"
          element={
            <AdminGuard>
              <Events />
            </AdminGuard>
          }
        />
        <Route path="/pages/:slug" element={<ContentPageView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Provider>
  );
}
function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}
export default App;
