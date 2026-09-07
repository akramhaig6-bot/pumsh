import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { statusBadge } from "../lib/api.jsx";

export function Spinner() {
  return <div className="spin" aria-label="تحميل" />;
}

export function Empty({ icon = "🗂️", title = "لا توجد بيانات", sub = "" }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3 style={{ marginBottom: ".2em" }}>{title}</h3>
      {sub && <p className="muted" style={{ marginBottom: 0 }}>{sub}</p>}
    </div>
  );
}

export function Badge({ map, value }) {
  const m = statusBadge(map, value);
  return <span className={`badge ${m.color}`}>{m.label}</span>;
}

export function Field({ label, req, hint, children, error }) {
  return (
    <div className="field">
      {label && <label className={req ? "req" : ""}>{label}</label>}
      {children}
      {error && <div className="hint" style={{ color: "var(--danger)" }}>{error}</div>}
      {hint && !error && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, foot, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="x" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++)
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return (
    <div className="pager">
      <button className="btn sm secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>السابق</button>
      {out.map((n, i) =>
        n === "…" ? <span key={`d${i}`}>…</span> :
        <button key={n} className={`btn sm ${n === page ? "cur" : "secondary"}`} onClick={() => onChange(n)}>{n}</button>,
      )}
      <button className="btn sm secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>التالي</button>
    </div>
  );
}

export function Tabs({ items, active, onChange }) {
  return (
    <div className="tabs">
      {items.map((it) => (
        <button key={it.k} className={active === it.k ? "on" : ""} onClick={() => onChange(it.k)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, icon }) {
  return (
    <div className="card stat">
      <div className="i">{icon}</div>
      <div className="n">{value ?? 0}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Confirm({ title = "تأكيد الإجراء", msg, onOk, onClose, danger, busy }) {
  return (
    <Modal title={title} onClose={onClose}
      foot={
        <>
          <button className="btn secondary" onClick={onClose}>إلغاء</button>
          <button className={`btn ${danger ? "danger" : ""}`} disabled={busy} onClick={onOk}>{busy ? "جارٍ..." : "تأكيد"}</button>
        </>
      }>
      <p style={{ margin: 0 }}>{msg}</p>
    </Modal>
  );
}

export function SectionLink({ to, children }) {
  return <Link className="btn ghost sm" to={to}>{children}</Link>;
}

export function Avatar({ name }) {
  return <span className="avatar">{(name || "؟").trim().slice(0, 1)}</span>;
}

/* ملفات: إظهار + تحميل */
export function FileChips({ files = [] }) {
  if (!files.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: ".4em" }}>
      {files.map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="chip">
          📎 {f.name}
        </a>
      ))}
    </div>
  );
}
