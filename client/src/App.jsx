import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, Toasts } from "./store.jsx";
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

function AdminEntry() {
  const { user, meReady } = useApp();

  if (!meReady) return null;
  if (!user) return <AdminLogin />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <AdminLayout />;
}

export default function App() {
  return (
    <AppProvider>
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
      </BrowserRouter>
    </AppProvider>
  );
}
