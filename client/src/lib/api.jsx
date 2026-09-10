/* عميل API موحد — كوكي الجلسة + توكن CSRF موقّع + أخطاء عربية */
import { useEffect, useState } from "react";

/*
 * ===== وضع النشر الوحيد المدعوم =====
 * خادم Node واحد على VPS يخدم الواجهة المبنية من dist/ والـ API معاً.
 * لذلك كل الطلبات نسبية، والكوكيات SameSite=Strict، ولا حاجة لأي
 * نطاق ثابت في الكود — الرابط يُشتق من الصفحة نفسها.
 *
 * VITE_API_URL بقي اختياريّاً لتسهيل التطوير فقط (خادم API منفصل محلياً).
 * لا يُستخدم لأي خدمة خارجية.
 */

export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const crossOrigin = !!API_BASE;

/** إكمال مسار API — يبقى نسبياً في الوضع الأحادي */
export function apiUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

/** تحويل رابط مورد نسبي (/api/up/..) إلى رابط كامل عند الحاجة */
export function absUrl(u) {
  if (!u || !API_BASE) return u;
  if (/^(https?:|data:|blob:|mailto:|#)/i.test(u) || u.startsWith("//")) return u;
  return `${API_BASE}${u.startsWith("/") ? u : `/${u}`}`;
}

/* ============================================================
   [M12] توكن CSRF

   الخادم صار يُصدر توكن HMAC موقّعاً في *جسم* استجابة /api/auth/csrf
   (لا كوكي قابل للقراءة). الكوكي القابل للقراءة كان يمكن زرعه من نطاق
   فرعي (cookie tossing) فيُبطل الحماية كلياً، لذلك حُذف.

   النتيجة: لا قراءة من document.cookie إطلاقاً — المصدر الوحيد هو
   الاستجابة، ويُحدَّث في كل رد يعيد التوكن.
============================================================ */
let csrfToken = "";

/** يُستدعى من المتجر عند الإقلاع وقبل أي طلب معدِّل */
export async function refreshCsrfToken() {
  try {
    const res = await fetch(apiUrl("/api/auth/csrf"), {
      credentials: crossOrigin ? "include" : "same-origin",
    });
    const data = await res.json().catch(() => null);
    if (data?.csrf) csrfToken = data.csrf;
  } catch {
    /* يبقى التوكن القديم؛ الخادم يرفض الطلب المعدِّل إن كان منتهياً */
  }
  return csrfToken;
}

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(t) {
  if (typeof t === "string" && t) csrfToken = t;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

/**
 * طلب API موحّد.
 * - يرسل توكن CSRF على كل طلب معدِّل
 * - يُحدِّث التوكن تلقائياً إن أعاده الخادم
 * - يعيد المحاولة مرة واحدة عند انتهاء صلاحية التوكن (403 CSRF_INVALID)
 * - لا يعرض أبداً رموز HTTP أو تفاصيل تقنية للعميل
 */
export async function api(path, { method = "GET", body, form, signal, retryOnCsrf = true } = {}) {
  const opts = {
    method,
    credentials: crossOrigin ? "include" : "same-origin",
    signal,
  };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (mutating) {
    if (!csrfToken) await refreshCsrfToken();
    opts.headers = { ...(opts.headers || {}), "X-CSRF-Token": csrfToken };
  }

  let res;
  try {
    res = await fetch(apiUrl(path), opts);
  } catch {
    throw new ApiError("تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مجدداً", 0, {});
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* رد غير JSON — يُعامل كعطل خدمة */
  }

  /* التوكن يدور كل 30 دقيقة — نأخذ الجديد من أي رد يحمله */
  if (data && typeof data.csrf === "string" && data.csrf) csrfToken = data.csrf;

  /* انتهاء صلاحية التوكن: نُجدِّده ونعيد المحاولة مرة واحدة */
  if (res.status === 403 && data?.code === "CSRF_INVALID" && mutating && retryOnCsrf) {
    csrfToken = "";
    await refreshCsrfToken();
    return api(path, { method, body, form, signal, retryOnCsrf: false });
  }

  if (!res.ok || !data?.ok) {
    const msg = data?.error || "تعذر تنفيذ الطلب، يرجى المحاولة بعد قليل";
    const err = new ApiError(msg, res.status, data);
    if (res.status === 401) window.dispatchEvent(new CustomEvent("auth:expired"));
    throw err;
  }
  return data;
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

export function statusBadge(map, key) {
  const m = map[key] || { label: key || "—", color: "gray" };
  return m;
}

/* صياغة عدد الإشعارات بالعربية */
export function unreadText(n) {
  const num = Number(n) || 0;
  if (num === 0) return "لا توجد إشعارات جديدة";
  if (num === 1) return "لديك إشعار جديد واحد";
  if (num === 2) return "لديك إشعاران جديدان";
  if (num <= 10) return `لديك ${num} إشعارات جديدة`;
  return `لديك ${num} إشعاراً جديداً`;
}

/* أرقام عرض إنسانية بدل المعرفات التقنية */
export const requestNo = (r) => `طلب رقم ${r?.seq ?? "—"}`;
export const ticketNo = (t) => `تذكرة رقم ${t?.seq ?? "—"}`;

/* الحد الأقصى لحجم الملف من إعدادات المنصة */
let _maxFileMB = null;
export function useMaxFileMB() {
  const [v, setV] = useState(_maxFileMB);
  useEffect(() => {
    if (_maxFileMB != null) {
      setV(_maxFileMB);
      return;
    }
    api("/api/meta")
      .then((d) => {
        _maxFileMB = Number(d.meta?.maxFileMB) || 5;
        setV(_maxFileMB);
      })
      .catch(() => setV(5));
  }, []);
  return v ?? 5;
}
