import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

import { config, DATABASE_PATH } from "./config.js";
import { db, closeDb } from "./db.js";
import { seed } from "./seed.js";
import logger from "./lib/logger.js";

import { generalLimiter } from "./lib/limiter.js";
import { csrfProtect, errorHandler, getSessionUserSafe } from "./lib/http.js";
import { corsMiddleware, isOriginAllowed } from "./lib/cors.js";
import { uploadCleanup, sweepTmpUploads } from "./lib/upload.js";
import { backfillAttachments } from "./services/attachments.js";
import { attachRealtime, connectionCount, statsDirty } from "./services/realtime.js";
import { runSessionMaintenance } from "./services/sessions.js";

import { auth } from "./routes/auth.js";
import { publicApi } from "./routes/public.js";
import { client } from "./routes/client.js";
import { me } from "./routes/me.js";
import { admin } from "./routes/admin.js";
import { cms } from "./routes/cms.js";
import { files } from "./routes/files.js";

/* ============================================================
   التهيئة
============================================================ */
logger.info("booting", { env: config.env, port: config.port, db: DATABASE_PATH, version: config.version });

/* ============================================================
   التطبيق
============================================================ */
const app = express();
app.disable("x-powered-by");

/*
 * [C4] لا ثقة بـ X-Forwarded-For افتراضياً.
 * كان `app.set("trust proxy", 1)` ثابتاً — فأي مهاجم يرسل الرأس
 * ويحصل على سطل rate-limit جديد في كل محاولة (تحقق فعلي: 429 ثم 401
 * بمجرد تغيير الرأس). الآن يُفعَّل فقط برقم صريح من TRUST_PROXY_HOPS،
 * ويُضبط أمام nginx كما في deployment/nginx.conf.
 */
if (config.trustProxyHops > 0) {
  app.set("trust proxy", config.trustProxyHops);
  logger.info("trust proxy enabled", { hops: config.trustProxyHops });
}

/*
 * [M7] ترويسات أمان حقيقية — بما فيها CSP.
 *
 * كان: contentSecurityPolicy: false بحجة "SPA يمرر HMR/WebSocket".
 * هذا غير دقيق: Vite يعمل على منفذ منفصل في التطوير، وفي الإنتاج تخدم
 * المنصة ملفات ثابتة مبنية من نفس الأصل — فلا حاجة لتعطيل CSP.
 *
 * connect-src 'self' كافٍ لـ Socket.IO لأنه على نفس الأصل/المنفذ.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'"],
        "connect-src": ["'self'"],
        "font-src": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
        "base-uri": ["'self'"],
        "upgrade-insecure-requests": config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(generalLimiter);

/* ============================================================
   [RT-2] WebSocket — توسعة Socket.IO القائم، لا استبداله
   غرف: public (الكل) + u:{userId} (المستخدم) + admin (المشرفون)
============================================================ */
const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    /* نفس سياسة CORS للـ API تماماً — لا استثناء للـ handshake */
    origin: (origin, cb) => cb(null, !origin || isOriginAllowed(origin)),
    credentials: true,
  },
  transports: ["websocket", "polling"],
  serveClient: false,
  /* لا نقبل اتصالات بلا حدود */
  maxHttpBufferSize: 1e5,
  pingTimeout: 25_000,
  pingInterval: 20_000,
});

/* لا io.use() حاجب: الزوار يدخلون غرفة public ويرون تحديثات المحتوى [RT-4] */
attachRealtime(io, (rawToken) => getSessionUserSafe(rawToken));

io.engine.on("connection_error", (err) => {
  logger.debug("socket connection error", { code: err.code, message: err.message });
});

/* ============================================================
   API
============================================================ */
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

/* [C2] CORS من ALLOWED_ORIGINS حصراً */
app.use("/api", corsMiddleware);

/*
 * [X6] نقطة صحة — بلا مصادقة، بلا تفاصيل حساسة.
 * الشكل المطلوب حرفياً:
 * { ok, status:"healthy", timestamp, uptime, db:"connected", version }
 */
app.get("/healthz", (req, res) => {
  let dbState = "disconnected";
  try {
    db.prepare("SELECT 1").get();
    dbState = "connected";
  } catch {
    /* يبقى disconnected */
  }
  const ok = dbState === "connected";
  res.status(ok ? 200 : 503).json({
    ok,
    status: ok ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: dbState,
    version: config.version,
  });
});

app.get("/api/health", (req, res) => {
  res.redirect(308, "/healthz");
});

/* [M12] حماية CSRF لكل طلب معدِّل */
app.use("/api", csrfProtect);

/* تنظيف الملفات المؤقتة التي لم تُستهلك */
app.use("/api", uploadCleanup);

app.use("/api/auth", auth);
app.use("/api", publicApi);
app.use("/api/me", me);
app.use("/api/client", client);
app.use("/api/admin", admin);
app.use("/api/cms", cms);
app.use("/api/files", files);

app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "الصفحة المطلوبة غير متوفرة" }));

/* ============================================================
   الواجهة الأمامية — Node يخدم dist/ على نفس الخادم (VPS واحد)
============================================================ */
const distDir = config.distDir;
const hasDist = fs.existsSync(path.join(distDir, "index.html"));
if (hasDist) {
  app.use(
    express.static(distDir, {
      maxAge: config.isProd ? "1h" : 0,
      index: false,
      setHeaders(res, filePath) {
        if (/\/assets\/.*\.(js|css)$/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
  logger.info("static frontend served", { distDir });
} else {
  app.get("/", (req, res) =>
    res.status(503).send(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>نعود إليك قريباً</title></head><body style="font-family:Tajawal,system-ui,sans-serif;background:#f6f8f7;color:#143d32;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center"><div style="max-width:560px;padding:2rem"><h1 style="font-size:2rem;margin-bottom:.5rem">نعود إليك قريباً</h1><p style="line-height:1.9;opacity:.85">الواجهة غير مبنية بعد — نفّذ <code>npm run build</code>.</p></div></body></html>`,
    ),
  );
  logger.warn("dist/ not built — frontend disabled");
}

/* الأخطاء — بعد كل المسارات */
app.use(errorHandler);

/* ============================================================
   مهام دورية
============================================================ */
const timers = [];

/* [M16] تنظيف الجلسات وتوكنات الاستعادة كل ساعة */
timers.push(
  setInterval(() => {
    try {
      const r = runSessionMaintenance();
      if (r.sessions || r.resetTokens) logger.info("session maintenance", r);
    } catch (e) {
      logger.error("session maintenance failed", { message: e.message });
    }
  }, 60 * 60_000),
);

/* تنظيف ملفات الرفع المؤقتة المهجورة كل 10 دقائق */
timers.push(
  setInterval(() => {
    try {
      sweepTmpUploads();
    } catch (e) {
      logger.error("tmp upload sweep failed", { message: e.message });
    }
  }, 10 * 60_000),
);

/* [RT-5] بث إحصاءات لوحة الإدارة كل 30 ثانية */
timers.push(setInterval(() => statsDirty("tick"), 30_000));

/* لا نترك أي مؤقّت يمنع Node من الخروج */
for (const t of timers) if (typeof t.unref === "function") t.unref();

/* ============================================================
   الإقلاع
============================================================ */
let shuttingDown = false;

async function bootstrap() {
  /* ترحيل سجلّ المرفقات للبيانات القائمة [M14] */
  try {
    const n = backfillAttachments();
    if (n) logger.info("attachments backfilled", { count: n });
  } catch (e) {
    logger.error("attachments backfill failed", { message: e.message });
  }

  await seed();

  server.listen(config.port, config.host, () => {
    logger.info("server listening", {
      port: config.port,
      host: config.host,
      env: config.env,
      dist: hasDist,
      sockets: connectionCount(),
    });
  });
}

/* ============================================================
   [X7] إيقاف نظيف + التقاط الأخطاء غير المعالَجة
   لم يكن أيٌّ من هذا موجوداً — فكان SIGTERM يقطع الطلبات الجاريات
   ويترك SQLite بلا إغلاق صحيح.
============================================================ */
function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown started", { signal });

  const force = setTimeout(() => {
    logger.error("shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000);
  force.unref?.();

  for (const t of timers) clearInterval(t);

  server.close(() => {
    try {
      io.close();
    } catch {
      /* قد يكون مغلقاً */
    }
    closeDb();
    logger.info("shutdown complete");
    clearTimeout(force);
    process.exit(code);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT", 0));

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (err) => {
  logger.error("uncaught exception — shutting down", { message: err.message, stack: err.stack });
  shutdown("uncaughtException", 1);
});

bootstrap().catch((e) => {
  logger.error("bootstrap failed", { message: e.message, stack: e.stack });
  process.exit(1);
});

export { app, server, io };
