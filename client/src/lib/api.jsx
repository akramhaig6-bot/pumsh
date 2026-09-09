/* عميل API موحد — كوكي الجلسة + CSRF + أخطاء عربية */
import { useEffect, useState } from "react";

/* ===== وضعا النشر المدعومان =====
   1) نفس الأصل (خادم واحد: VPS/سيرفرك): VITE_API_URL غير معرّف → طلبات نسبية
      وكوكيات SameSite=Strict — السلوك الأصلي دون أي تغيير.
   2) واجهة على Vercel + خادم API منفصل: عرّف VITE_API_URL=https://api.example.com
      أثناء البناء → كل الطلبات تتوجه للخادم مع credentials (CORS)،
      وتوكن CSRF يُحفظ من استجابة /api/auth/csrf (لا يلزم قراءة كوكي الطرف الآخر). */

export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const crossOrigin = !!API_BASE;

/** إكمال مسار API — يبقى نسبياً في الوضع الأحادي ويُسبق بالنطاق في وضع الفصل */
export function apiUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

/** تحويل رابط مورد (صورة/ملف مخزّن برابط نسبي مثل /api/up/..) إلى رابط كامل */
export function absUrl(u) {
  if (!u || !API_BASE) return u;
  if (/^(https?:|data:|blob:|mailto:|#)/i.test(u) || u.startsWith("//")) return u;
  return `${API_BASE}${u.startsWith("/") ? u : `/${u}`}`;
}

function csrfCookieToken() {
  const m = document.cookie.match(/(?:^|;\s*)nama_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/* في وضع الفصل (cross-origin) كوكي nama_csrf على نطاق الخادم لا يُقرأ من
   document.cookie، لذلك نحفظ التوكن الذي يعيده الخادم في /api/auth/csrf */
let csrfMem = "";
function csrfHeaderValue() {
  return csrfMem || csrfCookieToken();
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

export async function api(path, { method = "GET", body, form, signal } = {}) {
  const opts = {
    method,
    credentials: crossOrigin ? "include" : "same-origin",
    signal,
  };
  if (form) {
    opts.body = form; // FormData
  } else if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    opts.headers = { ...(opts.headers || {}), "X-CSRF-Token": csrfHeaderValue() };
  }
  /* انقطاع الشبكة/الخادم: رسالة عربية لائقة بدل رسائل المتصفح الإنجليزية الخام */
  let res;
  try {
    res = await fetch(apiUrl(path), opts);
  } catch {
    throw new ApiError("تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مجدداً", 0, {});
  }
  let data = null;
  try { data = await res.json(); } catch { /* رد غير JSON — يُعامل كعطل خدمة */ }
  if (data && typeof data.csrf === "string" && data.csrf) csrfMem = data.csrf;
  if (!res.ok || !data?.ok) {
    /* لا نعرض أبداً رموز HTTP أو تفاصيل تقنية للعميل */
    const msg = data?.error || "تعذر تنفيذ الطلب، يرجى المحاولة بعد قليل";
    const err = new ApiError(msg, res.status, data);
    if (res.status === 401) window.dispatchEvent(new CustomEvent("auth:expired"));
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

/* صياغة عدد الإشعارات بالعربية: "لا توجد إشعارات جديدة"، "لديك 3 إشعارات جديدة" */
export function unreadText(n) {
  const num = Number(n) || 0;
  if (num === 0) return "لا توجد إشعارات جديدة";
  if (num === 1) return "لديك إشعار جديد واحد";
  if (num === 2) return "لديك إشعاران جديدان";
  if (num <= 10) return `لديك ${num} إشعارات جديدة`;
  return `لديك ${num} إشعاراً جديداً`;
}

/* أرقام عرض إنسانية بدل المعرفات التقنية: "طلب رقم 1042" */
export const requestNo = (r) => `طلب رقم ${r?.seq ?? "—"}`;
export const ticketNo = (t) => `تذكرة رقم ${t?.seq ?? "—"}`;

/* الحد الأقصى لحجم الملف من إعدادات المنصة (مع تخزين مؤقت) لعرضه في تلميحات الرفع */
let _maxFileMB = null;
export function useMaxFileMB() {
  const [v, setV] = useState(_maxFileMB);
  useEffect(() => {
    if (_maxFileMB != null) { setV(_maxFileMB); return; }
    api("/api/meta")
      .then((d) => { _maxFileMB = Number(d.meta?.maxFileMB) || 5; setV(_maxFileMB); })
      .catch(() => setV(5));
  }, []);
  return v ?? 5;
}
