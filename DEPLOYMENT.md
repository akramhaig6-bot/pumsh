# دليل النشر — منصة نَما (وضعان مدعومان)

المشروع الآن مهيأ لدعم **وضعَي نشر** دون أي حذف وظائف أو تغيير تصميم:

| | **الوضع 1 — VPS / سيرفر Node واحد** | **الوضع 2 — Vercel (واجهة) + VPS (خادم API)** |
|---|---|---|
| الواجهة | يخدمها الخادم نفسه (`dist/`) | Vercel (static) |
| الـ API وWebSocket وSQLite والرفع | الخادم نفسه | خادم Node منفصل |
| متغير البناء | `VITE_API_URL` **غير معرّف** | `VITE_API_URL=https://api.example.com` |
| كوكيات الجلسة | SameSite=Strict | SameSite=None + Secure + CORS |
| النطاقات | واحد | نطاقان (أو نطاق + subdomain) |

> السلوك الافتراضي (دون أي متغيرات) هو الوضع 1 كما كان تماماً؛ الوضع 2 يُفعَّل فقط
> عندما تُعرَّف `VITE_API_URL` في بناء الواجهة وتُضبط `CORS_ORIGINS`/`PUBLIC_URL` على الخادم.

---

## المتطلبات الأساسية (الوضعان)

- **Node.js ≥ 22.13** (قاعدة البيانات تستخدم `node:sqlite` المدمجة).
- `package.json` يصرّح بذلك عبر `engines` — منصات مثل Vercel/Railway/Render
  تقرأه وتثبّت النسخة الصحيحة تلقائياً.

---

## الوضع 1 — النشر الكامل على VPS (أو Railway / Render / Fly.io)

لا يوجد أي تعديل على الكود؛ هذا هو الوضع الأصلي للمشروع.

### على السيرفر
```bash
git clone <repo> && cd pumsh
cp .env.example .env        # عدّل القيم (SECRET إلزامي)
npm install
npm run build               # يبني الواجهة إلى dist/
npm start                   # يعمل على المنفذ المحدد في .env (8080 افتراضياً)
```

### متغيرات البيئة (`.env`)
| المتغير | القيمة |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `SECRET` | سلسلة عشوائية طويلة |
| `PUBLIC_URL` | `https://your-domain.com` (بدون شرطة نهاية) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | حساب الأدمن الأول (قبل أول تشغيل) |
| `MAIL_MODE`, `SMTP_*` | `smtp` + بيانات مزود البريد (لروابط الاستعادة) |
| `CORS_ORIGINS` | اتركه **فارغاً** (لا حاجة في هذا الوضع) |
| `DATA_DIR` | اختياري — مسار قاعدة البيانات والملفات المرفوعة |

### خلف nginx (توصية)
```
location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host;
             proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
             proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade;
             proxy_set_header Connection "upgrade"; }
```
شغّل HTTPS عبر certbot. (`trust proxy: 1` مضبوط مسبقاً في `server/index.js`.)

### مهم جداً: القرص الدائم
قاعدة SQLite (`data/mana.db`) والملفات المرفوعة (`data/uploads/`) على قرص السيرفر.
- VPS عادي: تلقائي (مجلد `data/`).
- Railway/Render/Fly: اربط **Volume دائماً** بمجلد `data/` — وإلا يُمسح كل شيء عند كل إعادة نشر.

---

## الوضع 2 — الواجهة على Vercel + الخادم على VPS

### أولاً: على الخادم (API)
1. انشر مجلد المشروع على خادم Node (VPS/Railway/Render) بنفس خطوات الوضع 1 —
   **لكن** عدّل `.env` هكذا:

| المتغير | القيمة في وضع الفصل |
|---|---|
| `PUBLIC_URL` | `https://your-app.vercel.app` ← **عنوان الواجهة** (يُستخدم لروابط البريد ولمصافحة WebSocket) |
| `CORS_ORIGINS` | `https://your-app.vercel.app,https://your-domain.com` (نطاقات الواجهة المسموحة) |
| `NODE_ENV` | `production` (كوكيات الجلسة `Secure` تلقائياً عند cross-origin) |
| `SECRET`, `ADMIN_*`, `SMTP_*` | كما في الوضع 1 |

2. ملاحظة تلقائية: أي نطاق ينتهي بـ `.vercel.app` يُسمح له تلقائياً
   (معاينات Vercel) دون تعديل `CORS_ORIGINS`.

### ثانياً: على Vercel (الواجهة)
1. مشروع Vercel جديد مربوط بالمستودع.
2. **إعدادات المشروع (Dashboard ← Settings ← General):**
   - Framework Preset: `Vite` (أو Other)
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Node.js Version: `22.x` (يُقرأ من `engines`)
3. **Environment Variables (Settings ← Environment Variables):**
   - `VITE_API_URL` = `https://api.your-domain.com` (نطاق خادم الـ API — بدون شرطة نهاية)
   - (البناء يتطلبها؛ لا توجد أي `VITE_*` أخرى)
4. `vercel.json` الموجود في المستودع يضمن أن أي مسار داخلي
   (`/offers`, `/admin/...`, تحديث صفحة مباشر) يرد بـ `index.html`.
5. انشر. لا حاجة لأي Functions أو Serverless — كل شيء في `dist/` فقط.

> **لماذا لا يستضيف Vercel الخادم نفسه؟** Vercel بيئة Serverless/Stateless:
> لا WebSocket دائم، ولا قرص دائم (SQLite/الملفات المرفوعة) — لذلك الخادم على VPS
> وهذا الوضع هو التوزيع الصحيح للوضعين.

### كيف يعمل الاتصال (تلقائياً، بلا إعدادات إضافية)
- كل طلبات `api()` تتوجه إلى `VITE_API_URL` تلقائياً (`client/src/lib/api.jsx`).
- توكن CSRF يُؤخذ من استجابة `/api/auth/csrf` (يعمل عبر النطاقات).
- كوكي الجلسة: الخادم يرسلها `SameSite=None; Secure` فقط للطلبات القادمة من
  نطاق واجهة مسموح — ولن يرسلها بأي حال للطلبات الغريبة (CORS + CSRF).
- الصور والروابط المخزنة بروابط نسبية (`/api/up/..`، `/api/files?p=..`) تُعرض
  تلقائياً بنطاق الخادم عبر دالة `absUrl()`.
- الإشعارات الفورية (Socket.IO): الواجهة تتصل بنطاق الخادم مع `withCredentials`.

---

## قائمة تحقق ما بعد النشر (لأي وضع)

1. فتح `https://…/` → تظهر الواجهة **بدون أي خطأ في Console**.
2. تحديث مباشر (F5) على `https://…/admin/users` → تعمل (SPA fallback).
3. Network: `/api/meta` و `/api/home` → `200` بنوع `application/json`.
4. تسجيل دخول الأدمن من `/login-admin` → لوحة التحكم تعمل.
5. رفع صورة في مكتبة الوسائط → تظهر عبر `/api/up/...`.
6. إرسال إشعار من الأدمن أثناء فتح حساب عميل في تبويب آخر → يصل فوراً (WebSocket).
7. (وضع الفصل) بعد تسجيل الدخول: كوكي الجلسة على نطاق الخادم مع `SameSite=None; Secure`.

---

## حل مشاكل شائعة

| العَرَض | السبب/الحل |
|---|---|
| كل الـ APIs ترد HTML | الواجهة منشورة دون خادم (نسيت الخيار 2) أو `VITE_API_URL` غير معرّف أثناء البناء |
| الدخول يعمل لكن الإشعارات الفورية لا تصل | `PUBLIC_URL` على الخادم ليس عنوان الواجهة — صحّحه وأعد التشغيل |
| الصور لا تظهر في وضع الفصل | أعد البناء بعد تعريف `VITE_API_URL` (تُدمج في الحزمة وقت البناء) |
| المتصفح يرفض الكوكي (Console) | الخادم يجب أن يكون https (SameSite=None يتطلب Secure) |
| طلبات OPTIONS تفشل | تأكد أن `CORS_ORIGINS` يتضمن نطاق الواجهة بالضبط (https وبلا شرطة نهاية) |
