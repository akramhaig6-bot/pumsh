import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, API_BASE, refreshCsrfToken, setCsrfToken } from "./lib/api.jsx";

const Ctx = createContext(null);

export function useApp() {
  return useContext(Ctx);
}

/*
 * [RT-1] أسماء أحداث الوقت الحقيقي — مطابقة حرفياً لما يبثّه الخادم
 * (server/services/realtime.js → EV). أي تغيير هنا يجب أن يرافقه تغيير هناك.
 */
const EV = {
  OFFER_CREATED: "offer:created",
  OFFER_UPDATED: "offer:updated",
  OFFER_DELETED: "offer:deleted",
  OFFER_PUBLISHED: "offer:published",
  OFFER_UNPUBLISHED: "offer:unpublished",

  ARTICLE_CREATED: "article:created",
  ARTICLE_UPDATED: "article:updated",
  ARTICLE_DELETED: "article:deleted",
  ARTICLE_PUBLISHED: "article:published",

  PAGE_UPDATED: "page:updated",
  PAGE_DELETED: "page:deleted",
  CATEGORY_UPDATED: "category:updated",
  CATEGORY_DELETED: "category:deleted",
  MENU_UPDATED: "menu:updated",

  BANNER_CREATED: "banner:created",
  BANNER_UPDATED: "banner:updated",
  BANNER_DELETED: "banner:deleted",

  REQUEST_STATUS_CHANGED: "request:status_changed",
  REQUEST_NOTE_ADDED: "request:note_added",
  REQUEST_INFO_REQUESTED: "request:info_requested",
  REQUEST_ASSIGNED: "request:assigned",
  REQUEST_CREATED: "request:created",
  REQUEST_CANCELLED: "request:cancelled",

  TICKET_STATUS_CHANGED: "ticket:status_changed",
  TICKET_REPLY_ADDED: "ticket:reply_added",
  TICKET_ASSIGNED: "ticket:assigned",
  TICKET_CREATED: "ticket:created",

  SETTINGS_UPDATED: "settings:updated",
  TEXTS_UPDATED: "texts:updated",
  NOTIFICATION_NEW: "notification:new",
  ADMIN_STATS_UPDATED: "admin:stats_updated",
};

export { EV };

/*
 * [RT-2] اشتراك مركزي واحد.
 *
 * بدلاً من أن يفتح كل مكوّن اشتراكه الخاص (فتتعدد المستمعات ويصعب
 * ضبط دورة حياتها)، يشترك المتجر مرة واحدة ويعيد بث الأحداث عبر
 * نافذة المتصفح. أي صفحة تهتم بتغيّر معيّن تستمع لـ window event.
 */
function emitLocal(name, payload) {
  window.dispatchEvent(new CustomEvent(`rt:${name}`, { detail: payload }));
}

/**
 * [RT-3] استماع مريح داخل أي مكوّن.
 * @param {string|string[]} events اسم حدث RT (بدون بادئة) أو قائمة
 * @param {(payload:any)=>void} handler
 */
export function useRealtime(events, handler) {
  const list = useMemo(() => (Array.isArray(events) ? events : [events]), [events]);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const fn = (e) => handlerRef.current?.(e.detail);
    for (const name of list) window.addEventListener(`rt:${name}`, fn);
    return () => {
      for (const name of list) window.removeEventListener(`rt:${name}`, fn);
    };
  }, [list]);
}

/** يبث حدثاً محلياً يدوياً — يُستخدم بعد عملية ناجحة في نفس التبويب */
export function emitRealtime(name, payload) {
  emitLocal(name, payload);
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meReady, setMeReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const [socketOn, setSocketOn] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [backendOk, setBackendOk] = useState(null); // null=جارٍ الفحص، false=لا خادم
  const [rtVersion, setRtVersion] = useState(0); // يتغيّر مع كل تحديث محتوى عام
  const [meta, setMeta] = useState(null);
  const [texts, setTexts] = useState({});
  const [adminStatsAt, setAdminStatsAt] = useState(0);
  const socketRef = useRef(null);

  const toast = useCallback((msg, kind = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-4), { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /* فشل مصادقة → مسح الجلسة محلياً */
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setUnread(0);
      setToasts((t) => [
        ...t,
        { id: Date.now(), kind: "err", msg: "انتهت جلستك حفاظاً على أمان حسابك، يرجى تسجيل الدخول للمتابعة" },
      ]);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  /* ============================================================
     الإقلاع: صحة الخادم → توكن CSRF → حالة الجلسة → الإعدادات
     [M12] التوكن صار في جسم الاستجابة، فلا قراءة من document.cookie.
  ============================================================ */
  useEffect(() => {
    (async () => {
      let ok = false;
      try {
        const h = await fetch(`${API_BASE}/healthz`, { cache: "no-store" });
        const ct = h.headers.get("content-type") || "";
        const j = ct.includes("application/json") ? await h.json() : null;
        ok = h.ok && !!j?.ok;
      } catch {
        ok = false;
      }
      setBackendOk(ok);

      if (ok) {
        try {
          const c = await api("/api/auth/csrf");
          if (c?.csrf) setCsrfToken(c.csrf);
          const d = await api("/api/auth/me");
          if (d?.csrf) setCsrfToken(d.csrf);
          setUser(d.user);
          setUnread(d.user?.unread || 0);
        } catch {
          /* زائر */
        }
        /* الإعدادات والنصوص العامة — تُحدَّث لحظياً عبر settings:updated */
        try {
          const m = await api("/api/meta");
          setMeta(m.meta || null);
        } catch {
          /* غير حرج */
        }
        try {
          const t = await api("/api/texts");
          setTexts(t.texts || {});
        } catch {
          /* غير حرج */
        }
      }
      setMeReady(true);
    })();
  }, []);

  /* ============================================================
     [RT-2] اتصال Socket.IO — للزوار أيضاً (غرفة public)
     الخادم لا يحجب الاتصال بلا جلسة؛ المجهول يرى تحديثات المحتوى.
  ============================================================ */
  useEffect(() => {
    if (backendOk === false) return undefined;

    const s = io(API_BASE || "/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: !!API_BASE,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = s;

    s.on("connect", () => setSocketOn(true));
    s.on("disconnect", () => setSocketOn(false));
    s.on("connect_error", () => setSocketOn(false));
    s.on("ready", () => setSocketOn(true));

    /* إشعار جديد — يتضمّن العدد غير المقروء فلا حاجة لإعادة جلب */
    s.on(EV.NOTIFICATION_NEW, (p) => {
      setUnread(typeof p?.unread === "number" ? p.unread : (u) => u + 1);
      toast(p?.title || "إشعار جديد", "info");
      emitLocal(EV.NOTIFICATION_NEW, p);
    });

    /* المحتوى العام — كل تغيّر يُشعِر الصفحات بالتحديث دون reload */
    const contentEvents = [
      EV.OFFER_CREATED, EV.OFFER_UPDATED, EV.OFFER_DELETED, EV.OFFER_PUBLISHED, EV.OFFER_UNPUBLISHED,
      EV.ARTICLE_CREATED, EV.ARTICLE_UPDATED, EV.ARTICLE_DELETED, EV.ARTICLE_PUBLISHED,
      EV.PAGE_UPDATED, EV.PAGE_DELETED, EV.CATEGORY_UPDATED, EV.CATEGORY_DELETED, EV.MENU_UPDATED,
      EV.BANNER_CREATED, EV.BANNER_UPDATED, EV.BANNER_DELETED,
    ];
    for (const name of contentEvents) {
      s.on(name, (p) => {
        setRtVersion((v) => v + 1);
        emitLocal(name, p);
      });
    }

    /* [RT-1] الإعدادات: نستبدلها فوراً من الحمولة نفسها */
    s.on(EV.SETTINGS_UPDATED, (p) => {
      if (p?.meta) setMeta((m) => ({ ...(m || {}), ...p.meta }));
      setRtVersion((v) => v + 1);
      emitLocal(EV.SETTINGS_UPDATED, p);
    });

    /* [RT-1] النصوص العامة */
    s.on(EV.TEXTS_UPDATED, (p) => {
      if (p?.texts) setTexts((t) => ({ ...t, ...p.texts }));
      emitLocal(EV.TEXTS_UPDATED, p);
    });

    /* [RT-5] لوحة الإدارة */
    s.on(EV.ADMIN_STATS_UPDATED, (p) => {
      setAdminStatsAt(Date.now());
      emitLocal(EV.ADMIN_STATS_UPDATED, p);
    });

    /* الطلبات والتذاكر */
    const userEvents = [
      EV.REQUEST_STATUS_CHANGED, EV.REQUEST_NOTE_ADDED, EV.REQUEST_INFO_REQUESTED,
      EV.REQUEST_ASSIGNED, EV.REQUEST_CREATED, EV.REQUEST_CANCELLED,
      EV.TICKET_STATUS_CHANGED, EV.TICKET_REPLY_ADDED, EV.TICKET_ASSIGNED, EV.TICKET_CREATED,
    ];
    for (const name of userEvents) {
      s.on(name, (p) => {
        emitLocal(name, p);
        if (name === EV.REQUEST_STATUS_CHANGED && p?.statusLabel) {
          toast(p.statusLabel, "info");
        }
        if (name === EV.TICKET_REPLY_ADDED) toast("رد جديد على التذكرة", "info");
      });
    }

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [backendOk, toast]);

  const setAuth = useCallback((u) => {
    setUser(u);
    setUnread(u?.unread || 0);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const d = await api("/api/auth/me");
      if (d?.csrf) setCsrfToken(d.csrf);
      setUser(d.user);
      setUnread(d.user?.unread || 0);
    } catch {
      /* غير مسجل */
    }
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      const m = await api("/api/meta");
      setMeta(m.meta || null);
    } catch {
      /* تجاهل */
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const d = await api("/api/auth/logout", { method: "POST" });
      /* بعد الخروج يصدر الخادم توكن مجهول — نأخذه حتى تعمل الطلبات القادمة */
      if (d?.csrf) setCsrfToken(d.csrf);
      else await refreshCsrfToken();
    } catch {
      await refreshCsrfToken();
    }
    setUser(null);
    setUnread(0);
  }, []);

  const value = useMemo(
    () => ({
      user, meReady, backendOk, unread, socketOn, toasts, toast,
      setAuth, refreshMe, refreshMeta, logout,
      rtVersion, meta, texts, adminStatsAt,
    }),
    [user, meReady, backendOk, unread, socketOn, toasts, toast,
      setAuth, refreshMe, refreshMeta, logout, rtVersion, meta, texts, adminStatsAt],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <span className="x">✕</span>
        </div>
      ))}
    </div>
  );
}
