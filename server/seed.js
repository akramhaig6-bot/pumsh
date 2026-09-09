import { one, run, now, all } from "./db.js";
import { uid, hashPassword } from "./lib/util.js";
import { DEFAULT_SETTINGS, getSettings } from "./services/settings.js";

/**
 * البذور الطرفية:
 * 1) أدمن رئيسي من البيئة (ADMIN_EMAIL / ADMIN_PASSWORD) أو بيانات افتراضية مؤقتة.
 * 2) إعدادات افتراضية + نصوص + صفحات أساسية + قائمة رئيسية.
 */
export async function seed() {
  // ---------- 1) الأدمن ----------
  const email = (process.env.ADMIN_EMAIL || "admin@nama.local").toLowerCase().trim();
  const pass = process.env.ADMIN_PASSWORD || "Admin@12345";
  let admin = one("SELECT * FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1");
  if (!admin) {
    const { salt, hash } = hashPassword(pass);
    const id = uid("ADM");
    run(
      `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,must_change,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'admin',1,1,?,?)`,
      id, process.env.ADMIN_NAME || "مدير المنصة", email, "", hash, salt, now(), now(),
    );
    admin = one("SELECT * FROM users WHERE id=?", id);
    console.log(`[seed] تم إنشاء الأدمن: ${email} (كلمة المرور من ADMIN_PASSWORD أو الافتراضية — يجب تغييرها)`);
  }

  // ---------- 2) إعدادات ----------
  const s = getSettings();
  if (!s.seeded) {
    const next = { ...DEFAULT_SETTINGS, seeded: true };
    saveRawSettings(next);
    console.log("[seed] تم تفعيل الإعدادات الافتراضية");
  }

  // ---------- 3) صفحات أساسية ----------
  const pages = [
    { slug: "about", title: "من نحن", content: "<p>منصة نَما منصة إلكترونية تجمع العروض والخدمات في مكان واحد، وتمنحك تجربة واضحة وموثوقة من أول تصفح العرض حتى إتمام طلبك.</p><p>نؤمن أن وضوح الإجراءات وسرعة التواصل أساس الثقة، لذلك صممنا كل خطوة — من تقديم الطلب إلى تتبع حالته والتواصل مع فريق الدعم — لتكون بسيطة وشفافة.</p>" },
    { slug: "privacy", title: "سياسة الخصوصية", content: "<p>نحترم خصوصيتك ونلتزم بحماية بياناتك. تُستخدم البيانات التي تقدمها (مثل الاسم والبريد ورقم الجوال) فقط لمعالجة طلباتك والتواصل معك بشأنها، ولا نشاركها مع أي جهة خارجية.</p><p>نطبق إجراءات أمنية لحماية حسابك، بما في ذلك تشفير كلمات المرور وحماية الجلسات. يمكنك طلب تحديث بياناتك أو حذف حسابك في أي وقت عبر التواصل معنا.</p>" },
    { slug: "terms", title: "الشروط والأحكام", content: "<p>بإنشائك حساباً أو استخدامك المنصة فأنت توافق على هذه الشروط. أنت مسؤول عن دقة البيانات التي تقدمها وعن الحفاظ على سرية كلمة مرورك.</p><p>جميع الطلبات المقدمة تخضع لمراجعة فريقنا، وقد نطلب معلومات إضافية قبل قبول الطلب. نحتفظ بالحق في إيقاف أي حساب يسيء استخدام المنصة، مع إشعار صاحبه متى أمكن.</p>" },
    { slug: "contact", title: "تواصل معنا", content: "<p>يسعدنا تواصلك معنا في أي وقت. للاستفسارات العامة استخدم بيانات التواصل في أسفل الصفحة، وللمساعدة في طلباتك يمكنك فتح تذكرة دعم من حسابك وسنرد عليك في أقرب وقت.</p>" },
  ];
  for (const p of pages) {
    if (!one("SELECT id FROM pages WHERE slug=?", p.slug)) {
      run(
        `INSERT INTO pages (id,title,slug,content_html,status,created_at,updated_at) VALUES (?,?,?,?,'published',?,?)`,
        uid("PGE"), p.title, p.slug, p.content, now(), now(),
      );
    }
  }

  // ---------- 4) قائمة رئيسية ----------
  const menus = [
    { name: "الرئيسية", destination: "link", target: "/", ord: 1 },
    { name: "العروض", destination: "link", target: "/offers", ord: 2 },
    { name: "المقالات", destination: "link", target: "/articles", ord: 3 },
    { name: "من نحن", destination: "page", target: "about", ord: 4 },
    { name: "تواصل معنا", destination: "page", target: "contact", ord: 5 },
  ];
  for (const m of menus) {
    if (!one("SELECT id FROM menus WHERE name=? AND destination=?", m.name, m.destination)) {
      run(
        `INSERT INTO menus (id,name,destination,target,ord,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)`,
        uid("MNU"), m.name, m.destination, m.target, m.ord, now(), now(),
      );
    }
  }

  // ---------- 5) نصوص عامة ----------
  const texts = [
    { key: "empty.results", grp: "رسائل النظام", description: "رسالة عدم وجود نتائج", value: "لا توجد نتائج مطابقة" },
    { key: "offers.title", grp: "الصفحة الرئيسية", description: "عنوان قسم العروض", value: "العروض المتاحة" },
    { key: "articles.title", grp: "الصفحة الرئيسية", description: "عنوان قسم المقالات", value: "المقالات والمواضيع" },
    { key: "auth.welcome", grp: "الحساب", description: "رسالة الترحيب", value: "مرحباً بك في منصة نَما" },
  ];
  for (const t of texts) {
    if (!one("SELECT key FROM texts WHERE key=?", t.key)) {
      run(
        `INSERT INTO texts (key,grp,description,value,default_value,updated_at) VALUES (?,?,?,?,?,?)`,
        t.key, t.grp, t.description, t.value, t.value, now(),
      );
    }
  }

  console.log("[seed] تم التحقق من البذور الأساسية بنجاح");
}

function saveRawSettings(next) {
  const row = one("SELECT key FROM settings WHERE key='app'");
  if (row) {
    run("UPDATE settings SET value=?, updated_at=? WHERE key='app'", JSON.stringify(next), now());
  } else {
    run("INSERT INTO settings (key,value,updated_at) VALUES ('app',?,?)", JSON.stringify(next), now());
  }
}
