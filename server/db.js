import { DatabaseSync } from "node:sqlite";
import { DATABASE_PATH } from "./config.js";
import logger from "./lib/logger.js";

export const db = new DatabaseSync(DATABASE_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA synchronous = NORMAL;");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'client',
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT,
  last_login_at TEXT,
  failed INTEGER NOT NULL DEFAULT 0,
  failed_at TEXT,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT DEFAULT '',
  ua TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description_html TEXT NOT NULL,
  terms_html TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  reject_reason TEXT,
  cancel_reason TEXT,
  info_note TEXT,
  assigned_to TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS request_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  by_type TEXT NOT NULL,
  by_id TEXT,
  by_name TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS request_info (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  reply TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  by_type TEXT NOT NULL,
  by_id TEXT,
  by_name TEXT NOT NULL,
  text TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  read INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  actor_name TEXT NOT NULL DEFAULT 'النظام',
  entity_type TEXT,
  entity_id TEXT,
  entity_label TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content_html TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS texts (
  key TEXT PRIMARY KEY,
  grp TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  default_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS menus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT 'link',
  target TEXT NOT NULL DEFAULT '',
  ord INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS banner_clicks (
  id TEXT PRIMARY KEY,
  banner_id TEXT NOT NULL,
  user_id TEXT,
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  subline TEXT NOT NULL DEFAULT '',
  button_text TEXT NOT NULL DEFAULT '',
  button_link TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  related_offer_id TEXT,
  position TEXT NOT NULL DEFAULT 'hero',
  ord INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings_changes (
  id TEXT PRIMARY KEY,
  changes TEXT NOT NULL DEFAULT '[]',
  admin_id TEXT,
  admin_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

/* ============================================================
   [M14] جدول المرفقات المفهرس
   يستبدل البحث بـ LIKE '%path%' + N+1 على أربع جداول
   باستعلام واحد على فهرس فريد.
     owner_type: request | request_info | ticket | ticket_reply | media
     owner_id:   معرّف الكيان المالك
     uploader_id: من رفع الملف فعلياً (يُستخدم لمنح المالك حق التنزيل)
============================================================ */
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_req_user ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_req_offer ON requests(offer_id);
CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_hreq ON request_history(request_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_request ON tickets(request_id);
CREATE INDEX IF NOT EXISTS idx_tr_ticket ON ticket_replies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_noti_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_banners_status ON banners(status);
CREATE INDEX IF NOT EXISTS idx_banner_clicks ON banner_clicks(banner_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_created ON reset_tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at);
CREATE INDEX IF NOT EXISTS idx_media_path ON media(path);
CREATE INDEX IF NOT EXISTS idx_attachments_path ON attachments(path);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments(uploader_id);
`;

db.exec(SCHEMA);

/* ============================================================
   ترحيلات خفيفة للأعمدة الجديدة على قواعد قائمة
============================================================ */
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    logger.info("migration: column added", { table, col });
  }
}

ensureColumn("requests", "files", "files TEXT NOT NULL DEFAULT '[]'");
ensureColumn("tickets", "files", "files TEXT NOT NULL DEFAULT '[]'");
ensureColumn("requests", "seq", "seq INTEGER");
ensureColumn("tickets", "seq", "seq INTEGER");
ensureColumn("users", "failed_at", "failed_at TEXT");
ensureColumn("requests", "assigned_to", "assigned_to TEXT");
ensureColumn("tickets", "assigned_to", "assigned_to TEXT");

/* أرقام متسلسلة إنسانية للعرض ("طلب رقم 1042") بدل المعرفات التقنية */
try {
  db.exec(`UPDATE requests SET seq = sub.rn FROM
    (SELECT id, COALESCE((SELECT MAX(seq) FROM requests), 1000) + ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
     FROM requests WHERE seq IS NULL) sub WHERE requests.id = sub.id`);
  db.exec(`UPDATE tickets SET seq = sub.rn FROM
    (SELECT id, COALESCE((SELECT MAX(seq) FROM tickets), 1000) + ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
     FROM tickets WHERE seq IS NULL) sub WHERE tickets.id = sub.id`);
} catch (e) {
  logger.debug("seq backfill skipped", { message: e.message });
}

/** تنفيذ عدة أوامر داخل معاملة */
export function tx(fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* لا معاملة جارية */
    }
    throw e;
  }
}

export const now = () => new Date().toISOString();
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);

/** إغلاق نظيف — يُستدعى من graceful shutdown */
export function closeDb() {
  try {
    db.close();
    logger.info("database closed");
  } catch (e) {
    logger.warn("db close failed", { message: e.message });
  }
}
