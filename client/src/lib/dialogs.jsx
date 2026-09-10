/*
 * [M19] نوافذ حوار موحدة — بديل alert/confirm/prompt.

   alert/confirm/prompt متزامنة وتحجب خيط المتصفح، ولا يمكن تنسيقها،
   وتبدو غريبة في واجهة عربية RTL. هنا:
     - showError(msg)        → نافذة خطأ
     - showInfo(msg)         → نافذة معلومة
     - confirmDialog({...})  → Promise<boolean>
     - promptDialog({...})   → Promise<string|null>
   <DialogHost/> يُركَّب مرة واحدة في App.jsx ويتولى العرض.
   يستخدم نفس أصناف CSS الموجودة (.overlay/.modal) فلا تصميم مكرر.
*/
import { useCallback, useEffect, useId, useRef, useState } from "react";

let push = null;

function enqueue(item) {
  if (!push) return Promise.resolve(null);
  return new Promise((resolve) => push({ ...item, resolve }));
}

/** عرض رسالة خطأ */
export function showError(message, { title = "تعذّر إتمام العملية" } = {}) {
  return enqueue({ kind: "error", title, message });
}

/** رسالة معلومة/نجاح */
export function showInfo(message, { title = "تم" } = {}) {
  return enqueue({ kind: "info", title, message });
}

/**
 * تأكيد عملية.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = "تأكيد",
  message = "",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  danger = false,
} = {}) {
  return enqueue({ kind: "confirm", title, message, confirmText, cancelText, danger });
}

/**
 * طلب نص من المستخدم.
 * @returns {Promise<string|null>} null عند الإلغاء
 */
export function promptDialog({
  title = "إدخال",
  message = "",
  label = "",
  placeholder = "",
  defaultValue = "",
  confirmText = "حفظ",
  cancelText = "إلغاء",
  multiline = false,
  required = true,
} = {}) {
  return enqueue({
    kind: "prompt", title, message, label, placeholder, defaultValue,
    confirmText, cancelText, multiline, required,
  });
}

/** يغلّف استدعاء API: يعرض رسالة الخطأ العربية تلقائياً ثم يعيد الرمي */
export async function withErrorDialog(fn, fallback = "تعذّر إتمام العملية") {
  try {
    return await fn();
  } catch (e) {
    showError(e?.message || fallback);
    throw e;
  }
}

/* ============================================================
   المضيف — يُركَّب مرة واحدة
============================================================ */
export function DialogHost() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    let seq = 0;
    push = (item) => {
      const withId = { ...item, id: `dlg-${++seq}` };
      setQueue((q) => [...q, withId]);
    };
    return () => {
      push = null;
    };
  }, []);

  const close = useCallback((value) => {
    setQueue((q) => {
      const [head, ...rest] = q;
      if (head?.resolve) head.resolve(value);
      return rest;
    });
  }, []);

  const current = queue[0];
  if (!current) return null;
  return <DialogFrame key={current.id} item={current} onClose={close} />;
}

function DialogFrame({ item, onClose }) {
  const [value, setValue] = useState(item.defaultValue || "");
  const [invalid, setInvalid] = useState("");
  const inputRef = useRef(null);
  const titleId = useId();

  const submit = useCallback(() => {
    if (item.kind === "prompt" && item.required && !String(value).trim()) {
      setInvalid("هذا الحقل مطلوب");
      inputRef.current?.focus();
      return;
    }
    if (item.kind === "confirm") return onClose(true);
    if (item.kind === "prompt") return onClose(String(value).trim());
    return onClose(undefined);
  }, [item, value, onClose]);

  const cancel = useCallback(() => {
    if (item.kind === "confirm") return onClose(false);
    if (item.kind === "prompt") return onClose(null);
    return onClose(undefined);
  }, [item, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    /* تركيز أول حقل بعد الرسم */
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [cancel]);

  return (
    <div className="overlay" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h3 id={titleId} style={{ margin: 0 }}>{item.title}</h3>
          <button type="button" className="x" onClick={cancel} aria-label="إغلاق">✕</button>
        </div>

        <div className="modal-body">
          {item.message ? (
            <div
              className={item.kind === "error" ? "alert err" : "small"}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {item.message}
            </div>
          ) : null}

          {item.kind === "prompt" ? (
            <div className="field" style={{ marginTop: item.message ? "1rem" : 0 }}>
              {item.label ? <label>{item.label}</label> : null}
              {item.multiline ? (
                <textarea
                  ref={inputRef}
                  rows={4}
                  value={value}
                  placeholder={item.placeholder}
                  onChange={(e) => { setValue(e.target.value); setInvalid(""); }}
                />
              ) : (
                <input
                  ref={inputRef}
                  value={value}
                  placeholder={item.placeholder}
                  onChange={(e) => { setValue(e.target.value); setInvalid(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                />
              )}
              {invalid ? <div className="small" style={{ color: "var(--danger)" }}>{invalid}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          {item.kind !== "error" ? (
            <button type="button" className="btn secondary" onClick={cancel}>
              {item.cancelText}
            </button>
          ) : null}
          <button
            type="button"
            className={item.danger ? "btn danger" : "btn"}
            onClick={submit}
            autoFocus
          >
            {item.kind === "error" ? "حسناً" : item.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
