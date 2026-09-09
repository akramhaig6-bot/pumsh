import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { config, uploadsDir, mediaDir, attachmentsDir, DATABASE_PATH, distDir } from "./config.js";
import { db } from "./db.js";
import { seed } from "./seed.js";
import { generalLimiter, authLimiter, uploadLimiter } from "./lib/limiter.js";
import { csrfProtect, errorHandler, getRawToken, getSessionUser } from "./http-reexport.js";
import { attachIO } from "./services/notify.js";
import { attachRealtime } from "./services/realtime.js";
import { corsMiddleware, isOriginAllowed } from "./lib/cors.js";
import { auth } from "./routes/auth.js";
import { pub } from "./routes/public.js";
import { client } from "./routes/client.js";
import { me } from "./routes/me.js";
import { admin } from "./routes/admin.js";
import { cms } from "./routes/cms.js";
import { files } from "./routes/files.js";
import { uploads } from "./routes/uploads.js";

/* ---------------- توجيه الوظائف ---------------- */
fs.mkdirSync(config.dataDir, { recursive: true });
for (const d of [uploadsDir, mediaDir, attachmentsDir]) fs.mkdirSync(d, { recursive: true });

/* ---------------- التطبيق ---------------- */
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // SPA يمرر HMR/WebSocket؛ نتولى أمان الإدخال في API
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(generalLimiter);

/* ---------------- WebSocket ---------------- */
const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    // نفس الأصل + نطاقات الواجهة المسموحة + معاينات *.vercel.app
    origin: (origin, cb) => cb(null, !origin || isOriginAllowed(origin)),
    credentials: true,
  },
  transports: ["websocket", "polling"],
  serveClient: false,
});
io.use((socket, next) => {
  const raw = socket.handshake.auth?.token || socket.handshake.headers.cookie?.match(/nama_sid=([^;]+)/)?.[1] || "";
  const sess = raw ? getSessionUser(raw) : null;
  if (!sess) return next(new Error("unauthorized"));
  socket.userId = sess.id;
  socket.userRole = sess.role;
  next();
});
io.on("connection", (socket) => {
  socket.join(`u:${socket.userId}`);
  socket.emit("ready", { userId: socket.userId });
});
attachIO(io); // توصيل محرك الإشعارات
attachRealtime(io);

/* ---------------- تنسيق الاستجابة: تجاهل طرق غير API ---------------- */
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

/* ---------------- CORS (للواجهة على نطاق مختلف — Vercel + خادم API) ---------------- */
app.use("/api", corsMiddleware);

/* ---------------- الصحة ---------------- */
app.get("/api/health", (req, res) => {
  let ok = true;
  try { db.prepare("SELECT 1").get(); } catch { ok = false; }
  res.json({ ok, time: new Date().toISOString(), version: config.version, uptime: Math.floor(process.uptime()) });
});

/* ---------------- CSRF: كل تعديل غير مسموح إلا مع توكن أو SameSite ---------------- */
app.use("/api", csrfProtect);

/* ---------------- الرواتب ---------------- */
app.use("/api/uploads", uploadLimiter, uploads);
app.use("/api/auth", authLimiter, auth);
app.use("/api", pub);       // /api/meta /api/offers /api/articles /api/pages /api/home /api/categories
app.use("/api/me", me);     // إشعارات المستخدم
app.use("/api/client", client);
app.use("/api/admin", admin);
app.use("/api/cms", cms);
app.use("/api/files", files);

/* ---------------- مقاطع غير موجودة من API ---------------- */
app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "الصفحة المطلوبة غير متوفرة" }));

/* ---------------- الواجهة الأمامية ---------------- */
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: "1h", index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.status(503).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>نعود إليك قريباً</title></head><body style="font-family:Tajawal,system-ui,sans-serif;background:#f6f8f7;color:#143d32;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center"><div style="max-width:560px;padding:2rem"><h1 style="font-size:2rem;margin-bottom:.5rem">نعود إليك قريباً</h1><p style="line-height:1.9;opacity:.85">نعمل الآن على تحسين تجربتك. يرجى المحاولة بعد قليل.</p></div></body></html>`));
}

/* ---------------- الأخطاء ---------------- */
app.use(errorHandler);

/* ---------------- البذور ---------------- */
seed().catch((e) => {
  console.error("[seed] فشل:", e);
  process.exit(1);
});

/* ---------------- التشغيل ---------------- */
server.listen(config.port, "0.0.0.0", () => {
  console.log(`[nama] server on :${config.port}  env=${config.env}`);
  console.log(`[nama] data=${DATABASE_PATH}`);
});
