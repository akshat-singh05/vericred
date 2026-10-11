import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ---------- Icons (24x24 stroke icons, no external dependency) ---------- */
const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  building: <><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-5h6v5" /><path d="M9 11h.01M15 11h.01" /></>,
  cap: <><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>,
  verify: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 11 2 2 3.5-4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.2.7 3.5 2.4 3.5 5.2" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 8h6M9 12h6" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M10 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-2.3 3.2M6.5 6.6A15 15 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /><path d="m3 3 18 18" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  layers: <><path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="m2 13 10 5 10-5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  flask: <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" /><path d="M7.5 15h9" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  hash: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
};

export function Icon({ name, size = 18, className = "", strokeWidth = 1.8 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---------- Formatting helpers ---------- */
export const shortHash = (h, head = 8, tail = 6) =>
  !h ? "" : h.length <= head + tail + 3 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;

export const fmtNum = (n) => Number(n).toLocaleString("en-US");

export function fmtCompact(n) {
  const v = Number(n);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export function timeAgo(unixSeconds) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, type = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon name={t.type === "error" ? "alert" : t.type === "success" ? "check" : "activity"} size={16} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Small building blocks ---------- */
export function Button({ variant = "primary", icon, loading, children, className = "", ...rest }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", icon, children }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export function Card({ title, subtitle, icon, actions, children, className = "", pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-title">
            {icon && (
              <span className="card-icon">
                <Icon name={icon} size={18} />
              </span>
            )}
            <div>
              <h3>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? "card-body" : ""}>{children}</div>
    </section>
  );
}

export function CopyButton({ text, label }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    toast(label ? `${label} copied` : "Copied to clipboard", "success");
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button className="icon-btn" onClick={copy} title="Copy" aria-label="Copy">
      <Icon name={done ? "check" : "copy"} size={14} />
    </button>
  );
}

export function Hash({ value, head = 10, tail = 8, label }) {
  if (!value) return <span className="muted">-</span>;
  return (
    <span className="hash">
      <code title={value}>{shortHash(value, head, tail)}</code>
      <CopyButton text={value} label={label} />
    </span>
  );
}

export function StatCard({ icon, label, value, hint, tone = "blue" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-icon">
        <Icon name={icon} size={20} />
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, right }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </header>
  );
}

export function Empty({ icon = "file", title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function useInterval(fn, ms) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
