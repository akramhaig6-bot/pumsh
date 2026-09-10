# منصة نَما

منصة عربية (RTL) للعروض والطلبات: يتصفح الزائر العروض، يقدّم طلباً مع مرفقاته، يتابع حالته، ويفتح تذاكر دعم. ولوحة إدارة كاملة لإدارة المحتوى والعمليات.

**خادم واحد.** عملية Node واحدة تخدم واجهة React المبنية من `dist/`، وواجهة برمجة التطبيقات، وWebSocket — على نفس المنفذ. قاعدة البيانات SQLite محلية. لا خدمات خارجية، ولا CDN، ولا أي نطاق مكتوب في الكود.

---

## المتطلبات

- Node.js **22.13 أو أحدث** (يستخدم `node:sqlite` المدمج)
- npm 10+

```bash
node -v   # يجب أن تكون v22.13.0 أو أحدث
```

## التشغيل محلياً

```bash
npm install

# الأسرار والمسارات
cp .env.example .env
node server/config.js --gen-secret   # اطبع قيمتين عشوائيتين للسرّين

# التطوير: الخادم على :8080 والواجهة على :5173 (مع proxy)
npm run dev

# الإنتاج: ابنِ الواجهة ثم شغّل الخادم
npm run build
npm start
```

أول إقلاع ينشئ قاعدة البيانات ويطبّق الترحيلات ويضيف البذور (الصفحات الأساسية، القوائم، النصوص). **لا تُنشأ بيانات اعتماد افتراضية**: إن أردت مشرفاً أولياً اضبط `ADMIN_EMAIL` و`ADMIN_PASSWORD` قبل أول تشغيل، وسيُلزم النظام المشرف بتغيير كلمة المرور عند أول دخول.

## أوامر المشروع

| الأمر | الوظيفة |
| --- | --- |
| `npm run dev` | الخادم + واجهة Vite معاً |
| `npm run build` | بناء الواجهة إلى `dist/` |
| `npm start` | تشغيل الخادم (يخدم `dist/` إن وُجد) |
| `npm test` | اختبارات الخادم (`node --test`) |
| `npm run lint` | فحص ثابت للخادم والواجهة |
| `npm run audit` | فحص ثغرات الحزم |

## البنية

```
server/
  index.js              نقطة الدخول — Express + Socket.IO + الخدمة الثابتة
  config.js             كل الإعدادات من البيئة + فحوص الإنتاج
  db.js                 مخطط SQLite + الترحيلات
  seed.js               البذور الأولية (idempotent)
  lib/
    http.js             مصادقة + صلاحيات + CSRF + معالج أخطاء
    cors.js             سياسة CORS من ALLOWED_ORIGINS حصراً
    limiter.js          حدود المعدل مقسّمة حسب نوع المسار
    upload.js           multer + كشف النوع من البايتات + المرفقات
    validate.js         مخططات Zod + تعقيم HTML + كابتشا
    util.js             كلمات مرور scrypt + الجلسات + أدوات
    mailer.js           nodemailer
    logger.js           سجل JSON في الإنتاج ونص في التطوير
  routes/               auth, public, client, me, admin, cms, files
  services/             requests, tickets, notify, settings, events,
                        realtime, sessions, attachments
client/src/             React 19 + React Router (CSS عادي، بلا Tailwind)
deployment/             mana.service، nginx.conf، backup.sh
server/test/            اختبارات node:test
```

## النشر على VPS

```bash
# 1) الكود والتبعيات
sudo -u mana git clone <repo> /opt/mana && cd /opt/mana
npm ci --omit=dev

# 2) البيئة
sudo install -o mana -g mana -m 600 .env /opt/mana/.env
# حرّر .env وضبط: SESSION_SECRET, CSRF_SECRET, ALLOWED_ORIGINS,
#                  ADMIN_EMAIL, ADMIN_PASSWORD, MAIL_MODE=smtp

# 3) بناء الواجهة (يتطلب تبعيات التطوير)
npm ci && npm run build && npm prune --omit=dev

# 4) الوحدة والوكيل
sudo cp deployment/mana.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mana

sudo cp deployment/nginx.conf /etc/nginx/sites-available/mana
sudo ln -s /etc/nginx/sites-available/mana /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5) الشهادة
sudo certbot --nginx -d your-domain.example
```

بعد ضبط nginx اضبط `TRUST_PROXY_HOPS=1` في `.env` — قفزة واحدة فقط.

### النسخ الاحتياطي

```bash
sudo cp deployment/backup.sh /usr/local/bin/mana-backup
sudo chmod +x /usr/local/bin/mana-backup
echo '0 3 * * * mana /usr/local/bin/mana-backup >> /var/log/mana-backup.log 2>&1' \
  | sudo tee /etc/cron.d/mana-backup
```

ينسخ القاعدة بأمر `.backup` الآمن (وليس نسخ الملف وهو مفتوح)، يتحقق من سلامة النسخة، ثم ينسخ مجلد المرفقات، ويحذف ما تجاوز 14 يوماً.

## متغيرات البيئة

كل المتغيرات موثّقة في [`.env.example`](.env.example). الإلزامية في `production`:

| المتغير | الوظيفة |
| --- | --- |
| `SESSION_SECRET` | ≥ 64 حرفاً عشوائياً |
| `CSRF_SECRET` | ≥ 64 حرفاً عشوائياً، **مختلف** عن السابق |
| `ALLOWED_ORIGINS` | أصول CORS، مفصولة بفواصل |
| `ADMIN_EMAIL` | بريد المشرف الأولي |
| `MAIL_MODE=smtp` | + `MAIL_HOST` و`MAIL_FROM` |

يرفض الخادم الإقلاع في `production` إن نقص أي منها أو كانت القيم ضعيفة.

## نقاط النهاية الرئيسية

| المسار | الوظيفة |
| --- | --- |
| `GET /healthz` | `{ok, status, timestamp, uptime, db, version}` |
| `GET /api/auth/csrf` | توكن CSRF موقّع (في جسم الاستجابة فقط) |
| `GET /api/meta` | الإعدادات العامة |
| `GET /api/offers`, `/api/articles`, `/api/pages/:slug` | محتوى عام |
| `POST /api/client/requests` | تقديم طلب مع مرفقات |
| `GET /api/files?p=…` | تنزيل مرفق خاص (مالك أو مشرف) |
| `GET /api/up/:name` | صورة محتوى عامة من مكتبة الوسائط |
| `/api/admin/*`, `/api/cms/*` | لوحة الإدارة |

## الوقت الحقيقي

Socket.IO على نفس المنفذ عبر `/socket.io`. غرف: `public` (الكل، بما في ذلك الزوار)، `u:{userId}`، `admin`. كل تغيّر يُجريه المشرف على عرض أو مقال أو بانر أو إعداد يصل للمتصلين فوراً بلا تحديث للصفحة ولا polling.

## الأمان

- كلمات المرور: `scrypt` غير متزامن (`N=16384, r=8, p=1`)، والبارامترات محفوظة داخل نص الهاش.
- الجلسات: كوكي `httpOnly` + `SameSite=Strict` (+ `Secure` في الإنتاج)، تخزين البصمة sha256 فقط، حد أقصى للجلسات المتزامنة، وتنظيف دوري.
- CSRF: توكن HMAC مرتبط بالجلسة وبنافذة زمنية 30 دقيقة، يُسلَّم في جسم الاستجابة (لا كوكي قابل للقراءة)، مع فحص Origin/Referer كطبقة ثانية.
- CORS: `ALLOWED_ORIGINS` حصراً؛ لا اعتماد على اللاحقات ما لم يُطلب صراحة.
- المرفقات: قائمة أنواع مغلقة (بلا SVG)، كشف النوع من البايتات الأولى، رفض قبل أي كتابة على القرص، وسجل مفهرس للصلاحيات.
- HTML: تعقيم بقائمة وسوم وسمات مغلقة، بلا `data:` للصور.
- النسخة الاحتياطية: قائمة أعمدة صريحة لكل جدول — لا `pass_hash` ولا `salt` ولا جلسات.
