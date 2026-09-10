import { one, run, now } from "./db.js";
import { uid, hashPassword } from "./lib/util.js";
import { DEFAULT_SETTINGS } from "./services/settings.js";
import { config } from "./config.js";
import logger from "./lib/logger.js";

/**
 * البذور الطرفية — تُنفَّذ مرة عند الإقلاع، وكل خطوة idempotent.
 *
 * [X3] لا بيانات اعتماد افتراضية في الكود إطلاقاً.
 * المشرف الأولي يُنشأ فقط من ADMIN_EMAIL / ADMIN_PASSWORD في البيئة،
 * ويُولد بـ must_change=1 فيلزمه تغيير كلمة المرور قبل أي إجراء.
 */
export async function seed() {
  await seedAdmin();
  seedSettings();
  seedPages();
  seedMenus();
  seedTexts();
  logger.info("seed verified");
}

/* ============================================================
   1) المشرف الأولي
============================================================ */
async function seedAdmin() {
  const existing = one("SELECT id FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1");
  if (existing) return;

  const email = config.admin.email;
  const pass = config.admin.password;

  if (!email || !pass) {
    logger.warn("no admin user created — set ADMIN_EMAIL and ADMIN_PASSWORD to create one");
    return;
  }

  /* [M17] hashPassword غير متزامنة — تُنتظر وتُفكَّك */
  const { salt, hash, encoded } = await hashPassword(pass);
  const id = uid("ADM");
  run(
    `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,must_change,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'admin',1,1,?,?)`,
    id, config.admin.name, email, "", encoded || hash, salt, now(), now(),
  );

  /* لا نطبع كلمة المرور ولا نخزّنها — فقط البريد */
  logger.warn("initial admin created — password change is required at first login", { email });
}

/* ============================================================
   2) الإعدادات الافتراضية
============================================================ */
function seedSettings() {
  const row = one("SELECT value FROM settings WHERE key='app'");
  if (row) return;
  run(
    "INSERT INTO settings (key,value,updated_at) VALUES ('app',?,?)",
    JSON.stringify({ ...DEFAULT_SETTINGS, seeded: true }),
    now(),
  );
  logger.info("default settings applied");
}

/* ============================================================
   3) الصفحات الأساسية
============================================================ */
const PAGES = [
  {
    slug: "about",
    title: "من نحن",
    content:
      "<p>منصة نَما منصة إلكترونية تجمع العروض والخدمات في مكان واحد، وتمنحك تجربة واضحة وموثوقة من أول تصفح العرض حتى إتمام طلبك.</p><p>نؤمن أن وضوح الإجراءات وسرعة التواصل أساس الثقة، لذلك صممنا كل خطوة — من تقديم الطلب إلى تتبع حالته والتواصل مع فريق الدعم — لتكون بسيطة وشفافة.</p>",
  },
  {
    slug: "privacy",
    title: "سياسة الخصوصية",
    content:
      "<p>نحترم خصوصيتك ونلتزم بحماية بياناتك. تُستخدم البيانات التي تقدمها (مثل الاسم والبريد ورقم الجوال) فقط لمعالجة طلباتك والتواصل معك بشأنها، ولا نشاركها مع أي جهة خارجية.</p><p>نطبق إجراءات أمنية لحماية حسابك، بما في ذلك تشفير كلمات المرور وحماية الجلسات. يمكنك طلب تحديث بياناتك أو حذف حسابك في أي وقت عبر التواصل معنا.</p>",
  },
  {
    slug: "terms",
    title: "الشروط والأحكام",
    content:
      "<p>بإنشائك حساباً أو استخدامك المنصة فأنت توافق على هذه الشروط. أنت مسؤول عن دقة البيانات التي تقدمها وعن الحفاظ على سرية كلمة مرورك.</p><p>جميع الطلبات المقدمة تخضع لمراجعة فريقنا، وقد نطلب معلومات إضافية قبل قبول الطلب. نحتفظ بالحق في إيقاف أي حساب يسيء استخدام المنصة، مع إشعار صاحبه متى أمكن.</p>",
  },
  {
    slug: "contact",
    title: "تواصل معنا",
    content:
      "<p>يسعدنا تواصلك معنا في أي وقت. للاستفسارات العامة استخدم بيانات التواصل في أسفل الصفحة، وللمساعدة في طلباتك يمكنك فتح تذكرة دعم من حسابك وسنرد عليك في أقرب وقت.</p>",
  },
];

function seedPages() {
  let created = 0;
  for (const p of PAGES) {
    if (one("SELECT id FROM pages WHERE slug=?", p.slug)) continue;
    run(
      "INSERT INTO pages (id,title,slug,content_html,status,version,created_at,updated_at) VALUES (?,?,?,?,'published',1,?,?)",
      uid("PGE"), p.title, p.slug, p.content, now(), now(),
    );
    created += 1;
  }
  if (created) logger.info("seeded pages", { count: created });
}

/* ============================================================
   4) القائمة الرئيسية
============================================================ */
const MENUS = [
  { name: "الرئيسية", destination: "link", target: "/", ord: 1 },
  { name: "العروض", destination: "link", target: "/offers", ord: 2 },
  { name: "المقالات", destination: "link", target: "/articles", ord: 3 },
  { name: "من نحن", destination: "page", target: "about", ord: 4 },
  { name: "تواصل معنا", destination: "page", target: "contact", ord: 5 },
];

function seedMenus() {
  let created = 0;
  for (const m of MENUS) {
    if (one("SELECT id FROM menus WHERE name=? AND destination=?", m.name, m.destination)) continue;
    run(
      "INSERT INTO menus (id,name,destination,target,ord,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)",
      uid("MNU"), m.name, m.destination, m.target, m.ord, now(), now(),
    );
    created += 1;
  }
  if (created) logger.info("seeded menus", { count: created });
}

/* ============================================================
   5) النصوص العامة
============================================================ */
const TEXTS = [
  { key: "empty.results", grp: "رسائل النظام", description: "رسالة عدم وجود نتائج", value: "لا توجد نتائج مطابقة" },
  { key: "offers.title", grp: "الصفحة الرئيسية", description: "عنوان قسم العروض", value: "العروض المتاحة" },
  { key: "articles.title", grp: "الصفحة الرئيسية", description: "عنوان قسم المقالات", value: "المقالات والمواضيع" },
  { key: "auth.welcome", grp: "الحساب", description: "رسالة الترحيب", value: "مرحباً بك في منصة نَما" },
];

function seedTexts() {
  let created = 0;
  for (const t of TEXTS) {
    if (one("SELECT key FROM texts WHERE key=?", t.key)) continue;
    /* [M2] جدول texts مفتاحه `key` ولا يملك عمود id */
    run(
      "INSERT INTO texts (key,grp,description,value,default_value,updated_at) VALUES (?,?,?,?,?,?)",
      t.key, t.grp, t.description, t.value, t.value, now(),
    );
    created += 1;
  }
  if (created) logger.info("seeded texts", { count: created });
}
