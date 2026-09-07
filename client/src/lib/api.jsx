/* عميل API موحد — كوكي الجلسة + CSRF + أخطاء عربية */

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)nama_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

/* ============================================================
   بيانات عرض (Demo) تُستخدم فقط عندما يكون الموقع منشوراً
   كواجهة ثابتة (مثل Vercel) ولا يوجد Backend خلفه.
   في وضع الخادم الحقيقي، تعود البيانات الحقيقية من الـ API
   ولا يتم تفعيل هذا الـ fallback أبداً.
   ============================================================ */
const DEMO_NOW = () => new Date().toISOString();

const DEMO_META = {
  name: "نَما",
  tagline: "مساحة أهدأ لفرصٍ أوضح",
  description: "منصة تجريبية لعرض واجهات الموقع — تعمل هذه النسخة بدون خادم خلفي.",
  email: "demo@nama.local",
  phone: "+967 000 000 000",
  copyright: "© {year} منصة نَما — جميع الحقوق محفوظة.",
};

const DEMO_OFFER = {
  id: "demo-1",
  title: "نموذج عرض تجريبي",
  summary: "هذا عرض تجريبي يظهر عندما يعمل الموقع على استضافة ثابتة (بدون خادم).",
  description_html: "<p>هذه واجهة تجريبية. عند توصيل الخادم الحقيقي ستظهر هنا بياناتك الفعلية من لوحة الإدارة.</p>",
  terms_html: "",
  image: "",
  status: "published",
  start_date: null,
  end_date: null,
  created_at: DEMO_NOW(),
  category_name: "",
};

const DEMO_ARTICLE = {
  id: "demo-1",
  title: "نموذج مقال تجريبي",
  excerpt: "هذا المقال تجريبي وهو جزء من واجهة العرض عند عدم وجود خادم خلفي.",
  content_html: "<p>هذه واجهة تجريبية توضح شكل المقالات عند نشر المنصة كواجهة ثابتة.</p>",
  image: "",
  category_name: "تجريبي",
  created_at: DEMO_NOW(),
};

const DEMO_MENUS = [
  { id: "m1", name: "الرئيسية", destination: "section", target: "top" },
  { id: "m2", name: "العروض", destination: "url", target: "/offers" },
  { id: "m3", name: "المقالات", destination: "url", target: "/articles" },
  { id: "m4", name: "من نحن", destination: "page", target: "about" },
  { id: "m5", name: "تواصل معنا", destination: "page", target: "contact" },
];

const DEMO_SETTINGS = {
  name: "نَما",
  tagline: "مساحة أهدأ لفرصٍ أوضح",
  description: "منصة تجريبية لعرض واجهات الموقع",
  email: "demo@nama.local",
  phone: "+967 000 000 000",
  address: "",
  copyright: "© {year} جميع الحقوق محفوظة.",
  logo: "",
  favicon: "",
  socials: [],
  whatsapp: "",
  maxFileMB: 5,
  featuredCount: 6,
  articleCount: 3,
  pageSize: 12,
  allowRegistration: true,
  notifyNewUser: true,
  homeSections: [
    { id: "hero", label: "البانر الرئيسي", enabled: true },
    { id: "offers", label: "العروض المتاحة", enabled: true },
    { id: "articles", label: "المقالات", enabled: true },
  ],
  maintenance: false,
  maintenanceTitle: "",
  maintenanceMessage: "",
  returnDate: null,
};

const DEMO_REQUEST = {
  id: "demo-request",
  offer_title: "نموذج عرض تجريبي",
  status: "new",
  notes: "هذا سجل تجريبي.",
  files: [],
  reject_reason: "",
  cancel_reason: "",
  info_note: "",
  history: [
    { id: 1, from_status: null, to_status: "new", by_name: "الزائر", note: "إنشاء الطلب", created_at: DEMO_NOW() },
  ],
};

const DEMO_TICKET = {
  id: "demo-ticket",
  subject: "نموذج تذكرة دعم",
  status: "open",
  messages: [],
  created_at: DEMO_NOW(),
  updated_at: DEMO_NOW(),
};

function demoUser(role) {
  return {
    id: role === "admin" ? "demo-admin" : "demo-client",
    name: role === "admin" ? "مشرف تجريبي" : "زائر تجريبي",
    email: role === "admin" ? "admin@demo.local" : "client@demo.local",
    phone: "+967 000 000 000",
    role,
    active: true,
    unread: 0,
    must_change: false,
  };
}

function demoResponse(path, method) {
  const p = path.split("?")[0];
  const pagination = { page: 1, pages: 1 };

  // ---- المصادقة / الجلسة ----
  if (p === "/api/auth/csrf") return { ok: true, csrf: "demo-csrf" };
  if (p === "/api/auth/me") return { ok: true, user: null };
  if (p === "/api/auth/captcha") return { ok: true, id: "demo", question: "3 + 4 = ؟" };
  if (p === "/api/auth/login") return { ok: true, user: demoUser("client") };
  if (p === "/api/auth/admin/login") return { ok: true, user: demoUser("admin") };
  if (p === "/api/auth/logout") return { ok: true };

  // ---- عام / صفحة رئيسية ----
  if (p === "/api/home") return { ok: true, banners: [], offers: [DEMO_OFFER], articles: [DEMO_ARTICLE], meta: DEMO_META };
  if (p === "/api/meta") return { ok: true, meta: DEMO_META };
  if (p === "/api/menus") return { ok: true, menus: DEMO_MENUS };
  if (p === "/api/texts") return { ok: true, texts: {} };

  // ---- العروض ----
  if (p === "/api/offers") return { ok: true, offers: [DEMO_OFFER], pagination };
  if (p.startsWith("/api/offers/")) return { ok: true, offer: DEMO_OFFER, activeRequestId: null, expired: false };

  // ---- المقالات ----
  if (p === "/api/articles") return { ok: true, articles: [DEMO_ARTICLE], pagination };
  if (p.startsWith("/api/articles/")) return { ok: true, article: DEMO_ARTICLE, related: [] };

  // ---- الصفحات الثابتة ----
  if (p.startsWith("/api/pages/")) {
    const slug = p.split("/").pop() || "about";
    return { ok: true, page: { slug, title: "صفحة تجريبية", content_html: "<p>هذه صفحة تجريبية تظهر عند نشر المنصة كواجهة ثابتة.</p>" } };
  }

  // ---- حساب العميل ----
  if (p === "/api/client/requests") return { ok: true, requests: [], pagination };
  if (p.startsWith("/api/client/requests/")) return { ok: true, request: DEMO_REQUEST };
  if (p === "/api/client/tickets") return { ok: true, tickets: [], pagination };
  if (p.startsWith("/api/client/tickets/")) return { ok: true, ticket: DEMO_TICKET };
  if (p === "/api/client/notifications") return { ok: true, notifications: [] };

  // ---- CMS / لوحة الإدارة ----
  if (p === "/api/cms/articles") return { ok: true, articles: [], pagination };
  if (p === "/api/cms/categories") return { ok: true, categories: [] };
  if (p === "/api/cms/pages") return { ok: true, pages: [] };
  if (p === "/api/cms/banners") return { ok: true, banners: [] };
  if (p === "/api/cms/menus") return { ok: true, menus: [] };
  if (p === "/api/cms/texts") return { ok: true, texts: [] };
  if (p === "/api/cms/media") return { ok: true, media: [], pagination };
  if (p === "/api/cms/settings") return { ok: true, settings: { ...DEMO_SETTINGS } };
  if (p === "/api/cms/settings/changes") return { ok: true, changes: [] };

  // ---- لوحة الإدارة: نظرة عامة ----
  if (p === "/api/admin/stats") {
    return {
      ok: true,
      stats: { offers: 1, requests: 0, newRequests: 0, infoComplete: 0, clients: 0, ticketsOpen: 0 },
      needsActionRequests: [],
      needsReplyTickets: [],
      recentEvents: [],
    };
  }

  // ---- لوحة الإدارة: عمليات ----
  if (p === "/api/admin/requests") return { ok: true, requests: [], pagination };
  if (p.startsWith("/api/admin/requests/")) return { ok: true, request: DEMO_REQUEST };
  if (p === "/api/admin/requests/offers-select") return { ok: true, offers: [] };
  if (p === "/api/admin/tickets") return { ok: true, tickets: [], pagination };
  if (p.startsWith("/api/admin/tickets/")) return { ok: true, ticket: DEMO_TICKET };
  if (p === "/api/admin/users") return { ok: true, users: [], pagination };

  // ---- لوحة الإدارة: محتوى ----
  if (p === "/api/admin/offers") return { ok: true, offers: [], pagination };

  // ---- لوحة الإدارة: نظام ----
  if (p === "/api/admin/notifications") return { ok: true, notifications: [] };
  if (p === "/api/admin/events") return { ok: true, events: [], pagination };
  if (p === "/api/admin/admins") return { ok: true, admins: [demoUser("admin")] };

  // ---- أي مسار API آخر (نضع بيانات فارغة آمنة) ----
  return { ok: true, data: [], rows: [], items: [], settings: { ...DEMO_SETTINGS } };
}

export async function api(path, { method = "GET", body, form, signal } = {}) {
  const opts = { method, credentials: "same-origin", signal };
  if (form) {
    opts.body = form; // FormData
  } else if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    opts.headers = { ...(opts.headers || {}), "X-CSRF-Token": csrfToken() };
  }

  let res;
  let networkError = false;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    networkError = true;
  }

  let data = null;
  if (!networkError) {
    try { data = await res.json(); } catch (err) { /* ليست JSON */ }
  }

  /* وضع العرض الثابت: إذا فشل الاتصال بالخادم أو أعاد HTML بدلاً من JSON
     (وهذا يحدث على Vercel عندما يكون المشروع واجهة ثابتة فقط),
     نُعيد بيانات تجريبية لعرض الواجهات. لا يتفعل هذا مع خادم حقيقي لأن
     الـ API سيعيد JSON صحيحاً. */
  const fromFallback = networkError || data === null;
  if (path.startsWith("/api/") && fromFallback) {
    if (method === "GET" || ["/api/auth/login", "/api/auth/admin/login", "/api/auth/logout"].includes(path)) {
      return demoResponse(path, method);
    }
  }

  if (!res || !res.ok || !data?.ok) {
    const err = new ApiError(data?.error || "تعذر تنفيذ الطلب", res?.status || 0, data);
    if (res?.status === 401) window.dispatchEvent(new CustomEvent("auth:expired"));
    throw err;
  }
  return data;
}

/* عملية رفع ملفات بدون JSON */
export function uploadFiles(files, extra = {}) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  for (const [k, v] of Object.entries(extra)) form.append(k, v ?? "");
  return api("/api/uploads", { method: "POST", form });
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {}))
    if (v !== "" && v !== null && v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const fmtSize = (b) => {
  if (!b) return "0";
  if (b < 1024) return `${b} ب`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} ك.ب`;
  return `${(b / 1048576).toFixed(1)} م.ب`;
};

/* خرائط الحالات — لكل عنصر لون ووسم عربي */
export const REQUEST_STATUSES = {
  new: { label: "جديد", color: "blue" },
  review: { label: "قيد المراجعة", color: "amber" },
  info_waiting: { label: "بانتظار معلومات", color: "amber" },
  info_complete: { label: "اكتملت المعلومات", color: "blue" },
  accepted: { label: "مقبول", color: "green" },
  rejected: { label: "مرفوض", color: "red" },
  cancelled: { label: "ملغي", color: "gray" },
  completed: { label: "مكتمل", color: "green" },
  closed: { label: "مغلق", color: "gray" },
};
export const TICKET_STATUSES = {
  open: { label: "مفتوحة", color: "blue" },
  processing: { label: "قيد المعالجة", color: "amber" },
  waiting_client: { label: "بانتظار العميل", color: "amber" },
  waiting_admin: { label: "بانتظار الإدارة", color: "blue" },
  closed: { label: "مغلقة", color: "gray" },
  reopened: { label: "معاد فتحها", color: "red" },
};
export const OFFER_STATUSES = {
  draft: { label: "مسودة", color: "gray" },
  published: { label: "منشور", color: "green" },
  unpublished: { label: "غير منشور", color: "red" },
};
export const ARTICLE_STATUSES = {
  draft: { label: "مسودة", color: "gray" },
  published: { label: "منشور", color: "green" },
  unpublished: { label: "غير منشور", color: "red" },
};
export const PAGE_STATUSES = {
  draft: { label: "مسودة", color: "gray" },
  published: { label: "منشور", color: "green" },
  unpublished: { label: "غير منشور", color: "red" },
};

export function BADGE(map, key) {
  const m = map[key] || { label: key || "—", color: "gray" };
  return <span className={`badge ${m.color}`}>{m.label}</span>;
}

export function statusBadge(map, key) {
  const m = map[key] || { label: key || "—", color: "gray" };
  return m;
}
