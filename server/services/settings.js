import { one, all, run, now } from "../db.js";
import { uid, jsonParse, jsonStr } from "../lib/util.js";
import { logEvent } from "./events.js";

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
};

export function getSettings() {
  const row = one("SELECT value FROM settings WHERE key='app'");
  return { ...DEFAULT_SETTINGS, ...(row ? jsonParse(row.value, {}) : {}) };
}

export function getAllSettings() {
  return getSettings();
}

export function ensureSeeds() {
  const row = one("SELECT value FROM settings WHERE key='app'");
  if (!row) {
    run("INSERT INTO settings (key,value,updated_at) VALUES ('app',?,?)", jsonStr(getSettings()), now());
  }
  const texts = [
    ["home.offers_title", "الصفحة الرئيسية", "عنوان قسم العروض", "العروض المتاحة"],
    ["home.articles_title", "الصفحة الرئيسية", "عنوان قسم المقالات", "قراءات وأفكار"],
    ["empty.results", "رسائل النظام", "رسالة عدم وجود نتائج", "لا توجد نتائج مطابقة"],
    ["auth.welcome", "الحساب", "رسالة الترحيب", "مرحباً بك في منصتنا"],
    ["notification.request.accepted.title", "قوالب الإشعارات", "عنوان قبول الطلب", "تم قبول طلبك"],
    ["notification.request.accepted.body", "قوالب الإشعارات", "محتوى قبول الطلب", "تم قبول طلبك رقم {request_id} على العرض {offer_title}"],
    ["notification.request.rejected.title", "قوالب الإشعارات", "عنوان رفض الطلب", "تم رفض طلبك"],
    ["notification.request.rejected.body", "قوالب الإشعارات", "محتوى رفض الطلب", "تم رفض طلبك رقم {request_id}. السبب: {reason}"],
  ];
  for (const [key, grp, description, value] of texts) {
    const exists = one("SELECT key FROM texts WHERE key=?", key);
    if (!exists) {
      run(
        "INSERT INTO texts (key,grp,description,value,default_value,updated_at) VALUES (?,?,?,?,?,?)",
        key, grp, description, value, value, now(),
      );
    } else {
      const def = one("SELECT default_value,value FROM texts WHERE key=?", key);
      if (!def || !def.default_value) {
        run("UPDATE texts SET default_value=? WHERE key=?", value, key);
      }
    }
  }
}

/** حفظ الإعدادات مع سجل التغييرات (قبل/بعد) */
export function saveSettings(next, admin) {
  const before = getSettings();
  const keys = new Set([...Object.keys(before), ...Object.keys(next)]);
  const changes = [];
  for (const k of keys) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(next[k]);
    if (a !== b) changes.push({ key: k, before: before[k], after: next[k] });
  }
  run("UPDATE settings SET value=?, updated_at=? WHERE key='app'", jsonStr(next), now());
  run(
    "INSERT INTO settings_changes (id,changes,admin_id,admin_name,created_at) VALUES (?,?,?,?,?)",
    uid("SCH"),
    jsonStr(changes),
    admin.id,
    admin.name,
    now(),
  );
  if (changes.length) {
    logEvent({
      type: "settings.change",
      actorType: "admin",
      actorId: admin.id,
      actorName: admin.name,
      entityType: "settings",
      entityLabel: "إعدادات المنصة",
      details: { changes },
    });
  }
  return { before, changes, settings: next };
}

export function settingsChanges(page = 1, per = 25) {
  const rows = all(
    "SELECT id,changes,admin_name,created_at FROM settings_changes ORDER BY created_at DESC LIMIT ? OFFSET ?",
    per,
    (page - 1) * per,
  );
  const total = one("SELECT COUNT(*) c FROM settings_changes").c;
  return { rows, total };
}

/** البيانات العامة التي تظهر للزوار (لا تسرّب إعدادات داخلية) */
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
    maintenance: s.maintenance,
    maintenanceTitle: s.maintenanceTitle,
    maintenanceMessage: s.maintenanceMessage,
    returnDate: s.returnDate || "",
    homeSections: s.homeSections,
    pageSize: s.pageSize,
    maxFileMB: Number(s.maxFileMB ?? 5),
    featuredCount: Number(s.featuredCount ?? 6),
    articleCount: Number(s.articleCount ?? 3),
    allowRegistration: !!s.allowRegistration,
    allowCatalogView: !!s.allowCatalogView,
  };
}
