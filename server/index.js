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
  cors: { origin: config.publicUrl, credentials: true },
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
app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "الرابط غير موجود" }));

/* ---------------- الواجهة الأمامية ---------------- */
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: "1h", index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.send(`<h3>منصة نما — الواجهة غير مبنية بعد</h3><p>شغّل <code>npm run build</code> أو <code>npm run dev</code></p>`));
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
