import crypto from "node:crypto";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";

/* ---------------- التحقق من صحة البيانات ----------------
   قاعدة صارمة: كل حقل يواجه المستخدم يجب أن يحمل رسالة عربية كاملة —
   أي حقل بلا رسالة مخصصة سيسرّب رسالة Zod الإنجليزية الافتراضية للعميل. */
export const emailS = z
  .string({ required_error: "البريد الإلكتروني مطلوب", invalid_type_error: "البريد الإلكتروني مطلوب" })
  .trim()
  .toLowerCase()
  .min(1, "البريد الإلكتروني مطلوب")
  .email("صيغة البريد غير صحيحة — مثال: name@mail.com");
export const passwordS = z
  .string({ required_error: "كلمة المرور مطلوبة", invalid_type_error: "كلمة المرور مطلوبة" })
  .min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف")
  .regex(/[a-z]/, "كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل (a-z)")
  .regex(/[A-Z]/, "كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل (A-Z)")
  .regex(/\d/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل");
export const phoneS = z
  .string({ required_error: "رقم الجوال مطلوب", invalid_type_error: "رقم الجوال مطلوب" })
  .trim()
  .min(1, "رقم الجوال مطلوب")
  .regex(/^[+\d][\d\s-]{7,}$/, "رقم الجوال غير صحيح — أدخله بالصيغة الدولية، مثال: +967770000000");
export const nameS = z
  .string({ required_error: "الاسم مطلوب", invalid_type_error: "الاسم مطلوب" })
  .trim()
  .min(3, "الاسم لا يقل عن 3 أحرف")
  .max(80, "الاسم طويل جداً (الحد 80 حرفاً)");
export const slugS = z
  .string({ required_error: "الرابط المختصر مطلوب", invalid_type_error: "الرابط المختصر مطلوب" })
  .trim()
  .min(2, "الرابط المختصر لا يقل عن حرفين")
  .max(80, "الرابط المختصر طويل جداً (الحد 80 حرفاً)")
  .regex(/^[a-z0-9\u0600-\u06FF-]+$/, "الرابط المختصر يقبل الأحرف والأرقام والشرطات فقط");
export const textMin = (n, label = "النص") =>
  z.string({ required_error: `${label} مطلوب`, invalid_type_error: `${label} مطلوب` })
    .trim()
    .min(n, `${label} لا يقل عن ${n} أحرف`)
    .max(20000, `${label} طويل جداً (الحد 20000 حرف)`);

const confirmS = z.string({ required_error: "تأكيد كلمة المرور مطلوب", invalid_type_error: "تأكيد كلمة المرور مطلوب" });

export const registerSchema = z.object({
  name: nameS,
  email: emailS,
  phone: phoneS,
  password: passwordS,
  confirm: confirmS,
  terms: z.boolean({ required_error: "يجب الموافقة على الشروط والأحكام أولاً", invalid_type_error: "يجب الموافقة على الشروط والأحكام أولاً" }).refine((v) => v === true, { message: "يجب الموافقة على الشروط والأحكام أولاً" }),
}).refine((d) => d.password === d.confirm, { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] });

export const loginSchema = z.object({
  email: emailS,
  password: z.string({ required_error: "كلمة المرور مطلوبة", invalid_type_error: "كلمة المرور مطلوبة" }).min(1, "كلمة المرور مطلوبة"),
  captchaId: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

export const forgotSchema = z.object({ email: emailS });
export const resetSchema = z.object({
  token: z.string({ required_error: "رابط الاستعادة غير صالح، يرجى طلب رابط جديد" }).min(10, "رابط الاستعادة غير صالح، يرجى طلب رابط جديد"),
  password: passwordS,
  confirm: confirmS,
}).refine((d) => d.password === d.confirm, { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] });

export const changePasswordSchema = z.object({
  current: z.string({ required_error: "كلمة المرور الحالية مطلوبة" }).min(1, "كلمة المرور الحالية مطلوبة"),
  password: passwordS,
  confirm: confirmS,
}).refine((d) => d.password === d.confirm, { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] });

export const profileSchema = z.object({
  name: nameS,
  email: emailS,
  phone: phoneS,
});

export const offerSchema = z.object({
  title: z.string().trim().min(5, "عنوان العرض لا يقل عن 5 أحرف").max(160, "عنوان العرض طويل جداً (الحد 160 حرفاً)"),
  summary: z.string().trim().min(20, "الوصف المختصر لا يقل عن 20 حرفاً").max(500, "الوصف المختصر طويل جداً (الحد 500 حرف)"),
  description_html: z.string().min(10, "الوصف التفصيلي مطلوب").max(200000, "الوصف التفصيلي طويل جداً"),
  terms_html: z.string().max(200000, "الشروط طويلة جداً").default(""),
  image: z.string().trim().max(500, "مسار الصورة طويل جداً").default(""),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
}).superRefine((v, ctx) => {
  if (v.start_date && v.start_date < new Date().toISOString().slice(0, 10))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "تاريخ بداية العرض لا يمكن أن يكون في الماضي", path: ["start_date"] });
  if (v.end_date && v.start_date && v.end_date < v.start_date)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "تاريخ نهاية العرض يجب أن يكون بعد تاريخ البداية", path: ["end_date"] });
});

export const articleSchema = z.object({
  title: z.string().trim().min(3, "عنوان المقال لا يقل عن 3 أحرف").max(160, "عنوان المقال طويل جداً (الحد 160 حرفاً)"),
  slug: slugS,
  excerpt: z.string().trim().max(500, "المقتطف طويل جداً (الحد 500 حرف)").default(""),
  content_html: z.string().min(10, "محتوى المقال مطلوب").max(500000, "محتوى المقال طويل جداً"),
  image: z.string().trim().max(500, "مسار الصورة طويل جداً").default(""),
  category_id: z.string().trim().optional().nullable(),
  meta_title: z.string().trim().max(200, "عنوان SEO طويل جداً (الحد 200 حرف)").default(""),
  meta_description: z.string().trim().max(300, "وصف SEO طويل جداً (الحد 300 حرف)").default(""),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

export const pageSchema = z.object({
  title: z.string().trim().min(2, "عنوان الصفحة لا يقل عن حرفين").max(160, "عنوان الصفحة طويل جداً (الحد 160 حرفاً)"),
  slug: slugS,
  content_html: z.string().max(500000, "محتوى الصفحة طويل جداً").default(""),
  image: z.string().trim().max(500, "مسار الصورة طويل جداً").default(""),
  meta_title: z.string().trim().max(200, "عنوان SEO طويل جداً (الحد 200 حرف)").default(""),
  meta_description: z.string().trim().max(300, "وصف SEO طويل جداً (الحد 300 حرف)").default(""),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "اسم التصنيف لا يقل عن حرفين").max(80, "اسم التصنيف طويل جداً (الحد 80 حرفاً)"),
  slug: slugS,
  description: z.string().trim().max(500, "وصف التصنيف طويل جداً (الحد 500 حرف)").default(""),
});

export const ticketSchema = z.object({
  subject: z.string().trim().min(5, "عنوان التذكرة لا يقل عن 5 أحرف").max(160, "عنوان التذكرة طويل جداً (الحد 160 حرفاً)"),
  message: z.string().trim().min(20, "وصف المشكلة لا يقل عن 20 حرفاً — اشرح ما حدث بالتفصيل").max(5000, "الوصف طويل جداً (الحد 5000 حرف)"),
  request_id: z.string().trim().optional().nullable(),
});

export const replySchema = z.object({
  text: z.string().trim().min(1, "يرجى كتابة الرد أولاً").max(5000, "الرد طويل جداً (الحد 5000 حرف)"),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(2, "اسم المنصة مطلوب").max(50),
  tagline: z.string().trim().max(120).default(""),
  description: z.string().trim().max(500).default(""),
  email: z.union([z.literal(""), emailS]).default(""),
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(300).default(""),
  maxFileMB: z.coerce.number({ invalid_type_error: "الحد الأقصى لحجم الملف يجب أن يكون رقماً" }).min(1, "الحد الأقصى لحجم الملف لا يقل عن 1 ميغابايت").max(100, "الحد الأقصى لحجم الملف لا يتجاوز 100 ميغابايت"),
  featuredCount: z.coerce.number({ invalid_type_error: "عدد العروض المميزة يجب أن يكون رقماً" }).min(1, "عدد العروض المميزة لا يقل عن 1").max(48, "عدد العروض المميزة لا يتجاوز 48"),
  articleCount: z.coerce.number({ invalid_type_error: "عدد المقالات يجب أن يكون رقماً" }).min(0, "عدد المقالات لا يقل عن 0").max(24, "عدد المقالات لا يتجاوز 24"),
  pageSize: z.coerce.number({ invalid_type_error: "عدد العناصر في الصفحة يجب أن يكون رقماً" }).min(4, "عدد العناصر في الصفحة لا يقل عن 4").max(50, "عدد العناصر في الصفحة لا يتجاوز 50"),
  copyright: z.string().trim().max(200).default(""),
  socials: z.array(z.object({ type: z.string().max(40), url: z.string().trim().max(400).default("") })).max(20).default([]),
  maintenance: z.boolean().default(false),
  maintenanceTitle: z.string().trim().max(120).default(""),
  maintenanceMessage: z.string().trim().max(1000).default(""),
  returnDate: z.string().trim().optional().nullable(),
  privacySlug: z.string().trim().max(80).optional().nullable(),
  termsSlug: z.string().trim().max(80).optional().nullable(),
  logo: z.string().trim().max(500).default(""),
  favicon: z.string().trim().max(500).default(""),
  homeSections: z.array(z.object({ id: z.string(), label: z.string(), enabled: z.boolean() })).max(12).default([]),
  notifyNewUser: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.maintenance && !v.maintenanceMessage.trim())
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رسالة الصيانة مطلوبة عند التفعيل", path: ["maintenanceMessage"] });
});

export const requestSchema = z.object({
  offer_id: z.string({ required_error: "يرجى اختيار العرض المطلوب" }).min(1, "يرجى اختيار العرض المطلوب"),
  notes: z.string().trim().max(5000, "الملاحظات طويلة جداً (الحد 5000 حرف)").default(""),
});

/** نفس requestSchema — اسم صريح يُستخدم من الواجهة العامة */
export const requestCreateSchema = requestSchema;

export const infoSchema = z.object({
  reply: z.string().trim().min(1, "يرجى كتابة ردك أولاً").max(5000, "الرد طويل جداً (الحد 5000 حرف)"),
});

/**
 * استعلام العروض العامة — يُطبَّق في الخادم، لا في المتصفح.
 * [M3] page/per يُحوَّلان هنا إلى LIMIT/OFFSET داخل SQL.
 */
const intQ = (min, max, dflt, msg) =>
  z.coerce
    .number({ invalid_type_error: msg })
    .int(msg)
    .min(min, msg)
    .max(max, msg)
    .default(dflt)
    .catch(dflt);

export const offerQuerySchema = z.object({
  q: z.string().trim().max(120, "نص البحث طويل جداً").default(""),
  category: z.string().trim().max(80, "التصنيف غير صالح").default(""),
  page: intQ(1, 10000, 1, "رقم الصفحة غير صالح"),
  per: intQ(1, 50, 12, "عدد العناصر في الصفحة غير صالح (1–50)"),
}).transform((v) => ({ ...v, offset: (v.page - 1) * v.per }));

export const adminSchema = z.object({
  name: nameS,
  email: emailS,
  password: passwordS,
  confirm: confirmS,
}).refine((d) => d.password === d.confirm, { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] });

export const resetByAdminSchema = z.object({
  temp: passwordS,
  confirm: confirmS,
}).refine((d) => d.temp === d.confirm, { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] });

/* ---------------- تعقيم HTML ---------------- */
const CLEAN_OPTS = {
  allowedTags: [
    "p", "br", "b", "strong", "i", "em", "u", "s", "h1", "h2", "h3", "h4",
    "ul", "ol", "li", "blockquote", "a", "img", "span", "div", "table", "thead", "tbody", "tr", "th", "td", "hr", "figure", "figcaption",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    span: ["style"],
    p: ["style"],
    div: ["style"],
  },
  allowedStyles: { "*": { "text-align": [/^left$|^right$|^center$/], "font-weight": [/^bold$/] } },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  /* [X8] لا data: للصور — الـ base64 يمرّ داخل الصفحة ويُنفّذ بلا فحص MIME */
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  /* [X8] يُجبر rel=noopener على الروابط التي تفتح في نافذة جديدة */
  enforceHtmlBoundary: true,
  transformTags: {
    a: (tag, attribs) => ({
      tagName: "a",
      attribs: { ...attribs, rel: "noopener noreferrer" },
    }),
  },
};

export function cleanHtml(html = "") {
  return sanitizeHtml(String(html), CLEAN_OPTS).trim();
}

/* ---------------- كابتشا (تحدي رياضي بسيط) ----------------
   [M18] كانت Map بلا تنظيف إطلاقاً — أي شخص يملؤها بطلبات /captcha
   فيستهلك الذاكرة حتى يتعطّل الخادم. الآن: حدّ أعلى + تنظيف دوري. */
const captchas = new Map();
const CAPTCHA_MAX = 2000;
const CAPTCHA_TTL = 5 * 60_000;

function pruneCaptchas() {
  const at = Date.now();
  for (const [id, c] of captchas) if (c.expires < at) captchas.delete(id);
  /* إن بقيت ممتلئة (هجوم حقيقي) نحذف الأقدم حتى نصف السعة */
  if (captchas.size > CAPTCHA_MAX) {
    const drop = captchas.size - Math.floor(CAPTCHA_MAX / 2);
    let i = 0;
    for (const id of captchas.keys()) {
      if (i++ >= drop) break;
      captchas.delete(id);
    }
  }
}

export function createCaptcha() {
  pruneCaptchas();
  const a = crypto.randomInt(1, 9);
  const b = crypto.randomInt(1, 9);
  const id = crypto.randomBytes(10).toString("hex");
  captchas.set(id, { answer: a + b, expires: Date.now() + CAPTCHA_TTL });
  return { id, question: `${a} + ${b} = ؟` };
}

export function verifyCaptcha(id, answer) {
  const c = captchas.get(id);
  captchas.delete(id);
  if (!c) return false;
  if (c.expires < Date.now()) return false;
  return String(answer).trim() === String(c.answer);
}
