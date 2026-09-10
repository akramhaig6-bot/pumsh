import { useEffect, useRef, useState } from "react";
import { api, qs, absUrl } from "../lib/api.jsx";
import { Modal, Spinner } from "./ui.jsx";
import { promptDialog, showError } from "../lib/dialogs.jsx";

/**
 * محرر نص منسق خفيف مع شريط أدوات + إدراج صور من مكتبة الوسائط.
 * الصور تُرفع إلى مكتبة وسائط الإدارة على نفس الخادم — لا خدمات خارجية.
 *
 * [M19] استُبدل prompt/alert بنوافذ الحوار الموحدة.
 */
export function RichText({ value, onChange, height = 260, placeholders = true }) {
  const ref = useRef(null);
  const [pick, setPick] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, []);

  const cmd = (c, v = null) => {
    ref.current?.focus();
    document.execCommand(c, false, v);
    emit();
  };
  const emit = () => {
    const cur = ref.current;
    if (cur) onChange(cur.innerHTML);
  };

  const insertLink = async () => {
    const url = await promptDialog({
      title: "إدراج رابط",
      label: "الرابط",
      placeholder: "https://…",
      confirmText: "إدراج",
    });
    if (!url) return;
    /* لا نسمح ببروتوكولات قابلة للتنفيذ مثل javascript: */
    if (!/^(https?:|mailto:|tel:|\/)/i.test(url.trim())) {
      showError("الرابط يجب أن يبدأ بـ http أو https أو /", { title: "رابط غير صالح" });
      return;
    }
    cmd("createLink", url.trim());
  };
  const insertImage = (url) => {
    ref.current?.focus();
    document.execCommand("insertImage", false, url);
    emit();
  };

  return (
    <>
      <div className="toolbar">
        <button type="button" title="غامق" onClick={() => cmd("bold")}><b>B</b></button>
        <button type="button" title="مائل" onClick={() => cmd("italic")}><i>I</i></button>
        <button type="button" title="تسطير" onClick={() => cmd("underline")}><u>U</u></button>
        <button type="button" title="قائمة نقطية" onClick={() => cmd("insertUnorderedList")}>•≡</button>
        <button type="button" title="قائمة رقمية" onClick={() => cmd("insertOrderedList")}>1≡</button>
        <button type="button" title="عنوان" onClick={() => cmd("formatBlock", "<h2>")}>H2</button>
        <button type="button" title="فقرة" onClick={() => cmd("formatBlock", "<p>")}>¶</button>
        <button type="button" title="اقتباس" onClick={() => cmd("formatBlock", "<blockquote>")}>❝</button>
        <button type="button" title="رابط" onClick={insertLink}>🔗</button>
        <button type="button" title="صورة" onClick={() => setPick(true)}>🖼️</button>
        <button type="button" title="فاصل" onClick={() => cmd("insertHorizontalRule")}>—</button>
        <button type="button" title="مسح التنسيق" onClick={() => cmd("removeFormat")}>⌫x</button>
      </div>
      <div
        ref={ref}
        className="rich"
        style={{ minHeight: height }}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholders ? "اكتب المحتوى هنا..." : undefined}
      />
      {pick && (
        <MediaPicker
          onClose={() => setPick(false)}
          onPick={(m) => { insertImage(m.url); setPick(false); }}
          pick
        />
      )}
    </>
  );
}

/* اختيار/رفع وسائط من المكتبة */
export function MediaPicker({ onClose, onPick, pick = false, multi = false }) {
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [up, setUp] = useState(false);
  const [sel, setSel] = useState([]);
  const fileRef = useRef(null);

  const load = async (p = 1, query = "") => {
    setItems(null);
    const d = await api(`/api/cms/media${qs({ page: p, per: 24, q: query })}`);
    setItems(d);
  };
  useEffect(() => { load(page, q); }, [page]);

  const doUpload = async (files) => {
    if (!files?.length) return;
    setUp(true);
    try {
      // رفع إلى مكتبة وسائط الإدارة (تخزين محلي — لا خدمات خارجية)
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const d = await api("/api/cms/media/upload", { method: "POST", form });
      setItems(null); await load(1, "");
    } catch (e) { showError(e.message); }
    setUp(false);
  };

  const onPickMulti = (arr) => { if (multi && onPick) arr.forEach(onPick); };

  const choose = () => {
    if (pick) onPick(sel[0]);
    else if (multi) { onPick(sel); }
    onClose();
  };

  return (
    <Modal title="مكتبة الوسائط" onClose={onClose} wide
      foot={
        <>
          <button className="btn secondary" onClick={() => fileRef.current?.click()} disabled={up}>
            {up ? "جارٍ الرفع..." : "⬆ رفع ملفات"}
          </button>
          <button className="btn" onClick={choose} disabled={!sel.length}>اختيار ({sel.length})</button>
        </>
      }>
      <div className="flex" style={{ marginBottom: ".8em" }}>
        <input placeholder="بحث بالاسم..." value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load(1, q))} />
        <button className="btn sm secondary" onClick={() => { setPage(1); load(1, q); }}>بحث</button>
      </div>
      <input ref={fileRef} type="file" multiple hidden accept="image/*" onChange={(e) => doUpload(e.target.files)} />
      {!items ? <Spinner /> : (
        items.media?.length ? (
          <div className="media-grid">
            {items.media.map((m) => {
              const url = `/api/up/${encodeURIComponent(m.stored_name || m.path.split("/").pop())}`;
              const on = sel.some((s) => s.id === m.id);
              return (
                <div key={m.id} className={`m ${on ? "on" : ""}`}
                  onClick={() =>
                    setSel((s) =>
                      multi ? (on ? s.filter((x) => x.id !== m.id) : [...s, m]) : [m],
                    )
                  }>
                  <img src={absUrl(url)} alt={m.original_name} loading="lazy" />
                  <div className="cap" title={m.original_name}>{m.original_name}</div>
                </div>
              );
            })}
          </div>
        ) : <div className="empty"><div className="big">🖼️</div>لا توجد وسائط بعد</div>
      )}
    </Modal>
  );
}

/* أداة رفع سريع للإخراج (حقل صورة واحد) */
export function ImageInput({ value, onChange, label = "الصورة" }) {
  const [pick, setPick] = useState(false);
  return (
    <FieldWrap label={label}>
      <div className="flex">
        <input value={value || ""} placeholder="/api/up/..." onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn sm secondary" onClick={() => setPick(true)}>📁</button>
        {value && <button type="button" className="btn sm danger-soft" onClick={() => onChange("")}>✕</button>}
      </div>
      {value && <img src={absUrl(value)} alt="" style={{ marginTop: ".5em", maxHeight: 120, borderRadius: 8 }} />}
      {pick && <MediaPicker onClose={() => setPick(false)} onPick={(m) => { onChange(m.url); setPick(false); }} pick />}
    </FieldWrap>
  );
}

function FieldWrap({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
