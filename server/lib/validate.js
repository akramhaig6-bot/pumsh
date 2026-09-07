import crypto from "node:crypto";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";

/* ---------------- التحقق من صحة البيانات ---------------- */
export const emailS = z.string().trim().toLowerCase().email("صيغة البريد غير صحيحة");
export const passwordS = z
  .string()
  .min(8, "8 أحرف على الأقل")
  .regex(/[a-z]/, "حرف صغير")
  .regex(/[A-Z]/, "حرف كبير")
  .regex(/\d/, "رقم واحد على الأقل");
export const phoneS = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{7,}$/, "صيغة رقم الجوال غير صحيحة");
export const nameS = z.string().trim().min(3, "الاسم لا يقل عن 3 أحرف").max(80);
export const slugS = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9\u0600-\u06FF-]+$/, "أحرف وأرقام وشرطات فقط");
export const textMin = (n) => z.string().trim().min(n, `لا يقل عن ${n} أحرف`).max(20000);

export const registerSchema = z.object({
  name: nameS,
  email: emailS,
  phone: phoneS,
  password: passwordS,
  confirm: z.string(),
  terms: z.literal(true, { message: "يجب الموافقة على الشروط" }),
}).refine((d) => d.password === d.confirm, { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] });

export const loginSchema = z.object({
  email: emailS,
  password: z.string().min(1),
  captchaId: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

export const forgotSchema = z.object({ email: emailS });
export const resetSchema = z.object({
  token: z.string().min(10),
  password: passwordS,
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "غير متطابقتين", path: ["confirm"] });

export const changePasswordSchema = z.object({
  current: z.string().min(1),
  password: passwordS,
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "غير متطابقتين", path: ["confirm"] });

export const profileSchema = z.object({
  name: nameS,
  email: emailS,
  phone: phoneS,
});

export const offerSchema = z.object({
  title: z.string().trim().min(5, "العنوان لا يقل عن 5 أحرف").max(160),
  summary: z.string().trim().min(20, "الوصف المختصر لا يقل عن 20 حرفاً").max(500),
  description_html: z.string().min(10, "الوصف التفصيلي مطلوب").max(200000),
  terms_html: z.string().max(200000).default(""),
  image: z.string().trim().max(500).default(""),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
}).superRefine((v, ctx) => {
  if (v.start_date && v.start_date < new Date().toISOString().slice(0, 10))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "تاريخ البداية لا يكون في الماضي", path: ["start_date"] });
  if (v.end_date && v.start_date && v.end_date < v.start_date)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "تاريخ النهاية يجب أن يكون بعد البداية", path: ["end_date"] });
});

export const articleSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: slugS,
  excerpt: z.string().trim().max(500).default(""),
  content_html: z.string().min(10).max(500000),
  image: z.string().trim().max(500).default(""),
  category_id: z.string().trim().optional().nullable(),
  meta_title: z.string().trim().max(200).default(""),
  meta_description: z.string().trim().max(300).default(""),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

export const pageSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: slugS,
  content_html: z.string().max(500000).default(""),
  image: z.string().trim().max(500).default(""),
  meta_title: z.string().trim().max(200).default(""),
  meta_description: z.string().trim().max(300).default(""),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugS,
  description: z.string().trim().max(500).default(""),
});

export const ticketSchema = z.object({
  subject: z.string().trim().min(5, "العنوان لا يقل عن 5 أحرف").max(160),
  message: z.string().trim().min(20, "الوصف لا يقل عن 20 حرفاً").max(5000),
  request_id: z.string().trim().optional().nullable(),
});

export const replySchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(2, "اسم المنصة مطلوب").max(50),
  tagline: z.string().trim().max(120).default(""),
  description: z.string().trim().max(500).default(""),
  email: z.union([z.literal(""), emailS]).default(""),
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(300).default(""),
  maxFileMB: z.coerce.number().min(1).max(100),
  featuredCount: z.coerce.number().min(1).max(48),
  articleCount: z.coerce.number().min(0).max(24),
  pageSize: z.coerce.number().min(4).max(50),
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
  offer_id: z.string().min(1),
  notes: z.string().trim().max(5000).default(""),
});

export const infoSchema = z.object({
  reply: z.string().trim().min(1, "الرد مطلوب").max(5000),
});

export const adminSchema = z.object({
  name: nameS,
  email: emailS,
  password: passwordS,
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "غير متطابقتين", path: ["confirm"] });

export const resetByAdminSchema = z.object({
  temp: passwordS,
  confirm: z.string(),
}).refine((d) => d.temp === d.confirm, { message: "غير متطابقتين", path: ["confirm"] });

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
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
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

/* ---------------- كابتشا (تحدي رياضي بسيط) ---------------- */
const captchas = new Map();
export function createCaptcha() {
  const a = crypto.randomInt(1, 9);
  const b = crypto.randomInt(1, 9);
  const id = crypto.randomBytes(10).toString("hex");
  captchas.set(id, { answer: a + b, expires: Date.now() + 5 * 60_000 });
  return { id, question: `${a} + ${b} = ؟` };
}
export function verifyCaptcha(id, answer) {
  const c = captchas.get(id);
  captchas.delete(id);
  if (!c || c.expires < Date.now()) return false;
  return String(answer).trim() === String(c.answer);
}
