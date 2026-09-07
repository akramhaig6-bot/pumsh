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
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* فارغ */ }
  if (!res.ok || !data?.ok) {
    const err = new ApiError(data?.error || "تعذر تنفيذ الطلب", res.status, data);
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
