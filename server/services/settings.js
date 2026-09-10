import { one, all, run, now } from "../db.js";
import { uid, jsonParse, jsonStr } from "../lib/util.js";
import { logEvent } from "./events.js";
import { emitToAll, EV } from "./realtime.js";

/**
 * إعدادات المنصة — تُخزن كصف JSON واحد في جدول settings.
 * publicMeta() قائمة سماح مقصودة: لا يصل أي إعداد داخلي إلى الزوار.
 */
export const DEFAULT_SETTINGS = {
  name: "نَما",
  tagline: "اكتشف العروض وقدّم طلبك وتابعه أولاً بأول — كل خدماتنا في مكان واحد",
  description: "منصة تجمع العروض والطلبات في تجربة واضحة، موثوقة، ومصممة حول احتياجك.",
  email: "",
  phone: "",
  address: "",
  whatsapp: "",
  socials: [],
  maxFileMB: 5,
  featuredCount: 6,
  articleCount: 3,
  pageSize: 12,
  copyright: "© {year} منصة نَما — جميع الحقوق محفوظة.",
  maintenance: false,
  maintenanceTitle: "نعود إليك قريباً",
  maintenanceMessage: "نعمل الآن على تحسين تجربتك وسنعود قريباً. شكراً لصبرك وتفهمك.",
  returnDate: "",
  privacySlug: "",
  termsSlug: "",
  logo: "",
  favicon: "",
  homeSections: [
    { id: "hero", label: "البنر الرئيسي", enabled: true },
    { id: "offers", label: "العروض المميزة", enabled: true },
    { id: "features", label: "مميزات المنصة", enabled: true },
    { id: "articles", label: "المقالات الحديثة", enabled: true },
  ],
  notifyNewUser: false,
  allowRegistration: true,
  allowCatalogView: true,
  seeded: false,
};

export function getSettings() {
  const row = one("SELECT value FROM settings WHERE key='app'");
  return { ...DEFAULT_SETTINGS, ...(row ? jsonParse(row.value, {}) : {}) };
}

export function getAllSettings() {
  return getSettings();
}

/** حفظ الإعدادات مع سجل التغييرات (قبل/بعد) + بث لحظي */
export function saveSettings(next, admin, ip = "") {
  const before = getSettings();
  const keys = new Set([...Object.keys(before), ...Object.keys(next)]);
  const changes = [];
  for (const k of keys) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(next[k]);
    if (a !== b) changes.push({ key: k, before: before[k], after: next[k] });
  }

  /* INSERT OR REPLACE: ينجح حتى لو لم يكن الصف موجوداً بعد */
  run(
    "INSERT INTO settings (key,value,updated_at) VALUES ('app',?,?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    jsonStr(next),
    now(),
  );
  run(
    "INSERT INTO settings_changes (id,changes,admin_id,admin_name,created_at) VALUES (?,?,?,?,?)",
    uid("SCH"),
    jsonStr(changes),
    admin?.id || null,
    admin?.name || "النظام",
    now(),
  );

  if (changes.length) {
    logEvent({
      type: "settings.change",
      actorType: "admin",
      actorId: admin?.id || null,
      actorName: admin?.name || "النظام",
      entityType: "settings",
      entityLabel: "إعدادات المنصة",
      details: { keys: changes.map((c) => c.key) },
      ip,
    });
    /* [RT-1] الواجهة تحدّث الإعدادات المرئية فوراً — بلا reload */
    emitToAll(EV.SETTINGS_UPDATED, { changed: changes.map((c) => c.key), meta: publicMeta() });
  }
  return { before, changes, settings: next };
}

/** البيانات العامة التي تظهر للزوار — قائمة سماح، لا إعدادات داخلية */
export function publicMeta() {
  const s = getSettings();
  return {
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    logo: s.logo,
    favicon: s.favicon,
    email: s.email,
    phone: s.phone,
    address: s.address,
    socials: s.socials,
    copyright: s.copyright,
    maintenance: !!s.maintenance,
    maintenanceTitle: s.maintenanceTitle,
    maintenanceMessage: s.maintenanceMessage,
    returnDate: s.returnDate || "",
    homeSections: s.homeSections,
    pageSize: Number(s.pageSize ?? 12),
    maxFileMB: Number(s.maxFileMB ?? 5),
    featuredCount: Number(s.featuredCount ?? 6),
    articleCount: Number(s.articleCount ?? 3),
    allowRegistration: !!s.allowRegistration,
    allowCatalogView: !!s.allowCatalogView,
  };
}

/** [RT-1] يبث تحديث النصوص العامة لكل المتصلين */
export function broadcastTexts(reason = "update") {
  const rows = all("SELECT key, value FROM texts ORDER BY key");
  emitToAll(EV.TEXTS_UPDATED, {
    reason,
    texts: Object.fromEntries(rows.map((r) => [r.key, r.value])),
  });
}
