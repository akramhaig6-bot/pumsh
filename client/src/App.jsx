import { Component } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp, Toasts } from "./store.jsx";
import { DialogHost } from "./lib/dialogs.jsx";
import { PublicLayout, AccountLayout, AdminLayout } from "./components/shell.jsx";
import {
  Home, Offers, OfferDetail, Articles, ArticleDetail, PageView,
} from "./pages/public.jsx";
import { Login, AdminLogin, Register, Forgot, Reset } from "./pages/auth.jsx";
import { Overview, Profile, Requests, RequestDetail, Tickets, TicketDetail, Notifications } from "./pages/account.jsx";
import { Dashboard } from "./pages/admin/dashboard.jsx";
import { Requests as AdminRequests, RequestDetail as AdminRequestDetail, Tickets as AdminTickets, TicketDetail as AdminTicketDetail, Users } from "./pages/admin/operations.jsx";
import { Offers as AdminOffers, Articles as AdminArticles, Pages as AdminPages, Categories as AdminCategories, Banners as AdminBanners, Menus as AdminMenus, Texts as AdminTexts, Media as AdminMedia } from "./pages/admin/content.jsx";
import { Settings as AdminSettings, Notifications as AdminNotifications, Events as AdminEvents, Admins as AdminAdmins, Me as AdminMe } from "./pages/admin/system.jsx";

/* حاجز أخطاء: أي خطأ أثناء العرض يظهر بطاقة خطأ بدل صفحة بيضاء فارغة */
class CrashBoundary extends Component {
  state = { err: null, ref: "" };

  static getDerivedStateFromError(err) {
    return { err, ref: `ERR-${Date.now().toString(36).toUpperCase()}` };
  }

  componentDidCatch(err, info) {
    console.error("[app] تعطّل في الواجهة:", err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="wrap" style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "3rem 1rem", textAlign: "center" }}>
        <div className="card" style={{ maxWidth: 540, padding: "1.75rem" }}>
          <h1 style={{ marginTop: 0 }}>تعذّر عرض هذه الصفحة</h1>
          <p className="small muted">حدث خطأ غير متوقع. بياناتك محفوظة — جرّب إعادة المحاولة، وإن تكرر الخطأ تواصل معنا مع ذكر رمز المرجع أدناه.</p>
          {!import.meta.env.DEV && this.state.ref && (
            <p className="small muted">رمز المرجع: <span dir="ltr" className="mono">{this.state.ref}</span></p>
          )}
          {import.meta.env.DEV && (
            <pre className="small muted" dir="ltr" style={{ whiteSpace: "pre-wrap", textAlign: "left", background: "var(--surface2)", padding: ".75rem", borderRadius: 10 }}>
              {String(this.state.err?.message || this.state.err)}
            </pre>
          )}
          <div className="flex" style={{ justifyContent: "center" }}>
            <a className="btn secondary" href="/">الصفحة الرئيسية</a>
            <button className="btn" type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
          </div>
        </div>
      </div>
    );
  }
}

function AdminEntry() {
  const { user, meReady, backendOk } = useApp();

  if (!meReady) return null;
  if (backendOk === false) return <BackendDownNotice />;
  if (!user) return <AdminLogin />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <AdminLayout />;
}

/* لوحة الإدارة تعتمد كلياً على خادم API — إن لم يُصب إليه أي طلب
   (مثل النشر على Vercel كملفات ثابتة فقط، أو خادم متوقف) نعرض السبب بوضوح
   بدل أخطاء «تعذر تنفيذ الطلب» الغامضة. */
function BackendDownNotice() {
  return (
    <div className="wrap" style={{ maxWidth: 620, padding: "3rem 1rem 4rem" }}>
      <div className="card">
        <div className="center" style={{ marginBottom: "1.2rem" }}>
          <h1 style={{ marginBottom: ".1em" }}>تعذّر الاتصال بخدمة المنصة</h1>
          <p className="muted small" style={{ margin: 0 }}>
            لا يمكن الوصول إلى بيانات المنصة حالياً — قد تكون الخدمة متوقفة مؤقتاً أو هناك مشكلة في الاتصال.
          </p>
        </div>
        <div className="alert err">
          تعذر تحميل بيانات لوحة الإدارة. يرجى التحقق من النقاط التالية ثم إعادة المحاولة.
        </div>
        <ul className="small" style={{ textAlign: "right", paddingInlineStart: "1.2rem" }}>
          <li>تحقق من اتصالك بالإنترنت.</li>
          <li>تأكد أن خادم المنصة يعمل وأنه يستقبل الطلبات.</li>
          <li>إن كانت الواجهة منشورة على نطاق منفصل عن الخادم، تأكد من إعدادات الربط بينهما.</li>
          <li>إن استمرت المشكلة، تواصل مع الدعم الفني المسؤول عن الاستضافة.</li>
        </ul>
        <button className="btn block" type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CrashBoundary>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/offers" element={<Offers />} />
              <Route path="/offers/:id" element={<OfferDetail />} />
              <Route path="/articles" element={<Articles />} />
              <Route path="/articles/:id" element={<ArticleDetail />} />
              <Route path="/page/:slug" element={<PageView />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot" element={<Forgot />} />
              <Route path="/reset-password" element={<Reset />} />
              <Route path="/account" element={<AccountLayout />}>
                <Route index element={<Overview />} />
                <Route path="profile" element={<Profile />} />
                <Route path="requests" element={<Requests />} />
                <Route path="requests/:id" element={<RequestDetail />} />
                <Route path="tickets" element={<Tickets />} />
                <Route path="tickets/:id" element={<TicketDetail />} />
                <Route path="notifications" element={<Notifications />} />
              </Route>
            </Route>
            <Route path="/admin" element={<AdminEntry />}>
              <Route index element={<Dashboard />} />
              <Route path="requests" element={<AdminRequests />} />
              <Route path="requests/:id" element={<AdminRequestDetail />} />
              <Route path="tickets" element={<AdminTickets />} />
              <Route path="tickets/:id" element={<AdminTicketDetail />} />
              <Route path="users" element={<Users />} />
              <Route path="offers" element={<AdminOffers />} />
              <Route path="articles" element={<AdminArticles />} />
              <Route path="pages" element={<AdminPages />} />
              <Route path="categories" element={<AdminCategories />} />
              <Route path="banners" element={<AdminBanners />} />
              <Route path="menus" element={<AdminMenus />} />
              <Route path="texts" element={<AdminTexts />} />
              <Route path="media" element={<AdminMedia />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="admins" element={<AdminAdmins />} />
              <Route path="me" element={<AdminMe />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toasts />
          {/* [M19] نافذة الحوار الموحدة — تُركَّب مرة واحدة فوق كل التطبيق */}
          <DialogHost />
        </BrowserRouter>
      </CrashBoundary>
    </AppProvider>
  );
}
