import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { AppCtx } from "./context";
import { Icon, ToastProvider, shortHash, useInterval } from "./ui";
import Overview from "./pages/Overview";
import Issuer from "./pages/Issuer";
import Holder from "./pages/Holder";
import Verifier from "./pages/Verifier";
import Governance from "./pages/Governance";
import HowItWorks from "./pages/HowItWorks";

const NAV = [
  { id: "overview", label: "Overview", icon: "dashboard", component: Overview },
  { id: "issuer", label: "Issuer", icon: "building", component: Issuer, role: "University" },
  { id: "holder", label: "Holder", icon: "cap", component: Holder, role: "Student" },
  { id: "verifier", label: "Verifier", icon: "verify", component: Verifier, role: "Employer" },
  { id: "governance", label: "Governance", icon: "users", component: Governance, role: "Consortium" },
  { id: "how", label: "How it works", icon: "book", component: HowItWorks },
];

function LogoMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset="1" stopColor="#22c1b8" />
        </linearGradient>
      </defs>
      <path d="M20 2 36 11v18L20 38 4 29V11z" fill="url(#lg)" />
      <path d="m13 20.5 5 5 9-10" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [stats, setStats] = useState(null);
  const [offline, setOffline] = useState(null);
  const [session, setSession] = useState({ presentation: null });

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.stats());
      setOffline(null);
    } catch (e) {
      setOffline(e.message);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);
  useInterval(refreshStats, 6000);

  const ctx = useMemo(
    () => ({
      stats,
      refreshStats,
      go: setPage,
      session,
      setSession,
      labelFor: (addr) => (addr && stats?.labels?.[addr.toLowerCase()]) || shortHash(addr || "", 6, 4),
    }),
    [stats, refreshStats, session]
  );

  const current = NAV.find((n) => n.id === page);
  const Page = current.component;

  return (
    <ToastProvider>
      <AppCtx.Provider value={ctx}>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <LogoMark />
              <div>
                <div className="brand-name">VeriCred</div>
                <div className="brand-sub">Credential verification</div>
              </div>
            </div>

            <nav className="nav" aria-label="Main">
              {NAV.map((n) => (
                <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                  <Icon name={n.icon} size={18} />
                  <span>{n.label}</span>
                  {n.role && <em>{n.role}</em>}
                </button>
              ))}
            </nav>

            <div className="sidebar-foot">
              <div className={`net-pill ${offline ? "down" : "up"}`}>
                <span className="dot" />
                {offline ? "Backend offline" : "Network connected"}
              </div>
              {stats && !offline && (
                <dl className="net-meta">
                  <div>
                    <dt>Chain</dt>
                    <dd>
                      {stats.network.name} · {stats.network.chainId}
                    </dd>
                  </div>
                  <div>
                    <dt>Block</dt>
                    <dd>#{stats.blockNumber}</dd>
                  </div>
                </dl>
              )}
              <p className="foot-note">Permissioned consortium prototype</p>
            </div>
          </aside>

          <main className="main">
            {offline && (
              <div className="banner-error">
                <Icon name="alert" size={18} />
                <div>
                  <strong>Cannot reach the backend.</strong> Start the chain, deploy, and run the backend (see README), then this page reconnects automatically.
                </div>
              </div>
            )}
            <div className="page" key={page}>
              <Page />
            </div>
          </main>
        </div>
      </AppCtx.Provider>
    </ToastProvider>
  );
}
