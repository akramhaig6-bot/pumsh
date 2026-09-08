import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, API_BASE } from "./lib/api.jsx";

const Ctx = createContext(null);

export function useApp() {
  return useContext(Ctx);
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meReady, setMeReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const [socketOn, setSocketOn] = useState(false);
  const [toasts, setToasts] = useState([]);
  const socketRef = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;

  /* فشل مصادقة → مسح الجلسة محلياً */
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setUnread(0);
      setToasts((t) => [...t, { id: Date.now(), kind: "err", msg: "انتهت جلستك، سجّل الدخول من جديد" }]);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  /* عند الإقلاع: كوكي CSRF ثم حالة الجلسة */
  useEffect(() => {
    (async () => {
      try {
        await api("/api/auth/csrf");
        const d = await api("/api/auth/me");
        setUser(d.user);
        setUnread(d.user?.unread || 0);
      } catch { /* زائر */ }
      setMeReady(true);
    })();
  }, []);

  /* WebSocket — إشعارات فورية */
  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketOn(false);
      return;
    }
    const s = io(API_BASE || "/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: !!API_BASE, // في وضع الفصل: إرفاق كوكي الجلسة (نطاق الخادم)
    });
    socketRef.current = s;
    s.on("connect", () => setSocketOn(true));
    s.on("disconnect", () => setSocketOn(false));
    s.on("ready", () => setSocketOn(true));
    s.on("notify", (p) => {
      setUnread(p.unread ?? 0);
      setToasts((t) => [...t.slice(-4), { id: Date.now(), kind: "info", msg: p.title || "إشعار جديد" }]);
    });
    return () => { s.disconnect(); socketRef.current = null; };
  }, [user?.id]);

  const toast = useCallback((msg, kind = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-4), { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const setAuth = useCallback((u) => {
    setUser(u);
    setUnread(u?.unread || 0);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const d = await api("/api/auth/me");
      setUser(d.user);
      setUnread(d.user?.unread || 0);
    } catch { /* غير مسجل */ }
  }, []);

  const logout = useCallback(async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* تجاهل */ }
    setUser(null);
    setUnread(0);
  }, []);

  const value = useMemo(
    () => ({ user, meReady, unread, socketOn, toasts, toast, setAuth, refreshMe, logout }),
    [user, meReady, unread, socketOn, toasts, toast, setAuth, refreshMe, logout],
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
