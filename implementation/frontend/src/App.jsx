import { useEffect, useState } from "react";
import { api } from "./api";
import IssuerPanel from "./components/IssuerPanel";
import HolderPanel from "./components/HolderPanel";
import VerifierPanel from "./components/VerifierPanel";
import GovernancePanel from "./components/GovernancePanel";

const TABS = [
  { id: "issuer", label: "Issuer", component: IssuerPanel },
  { id: "holder", label: "Holder", component: HolderPanel },
  { id: "verifier", label: "Verifier", component: VerifierPanel },
  { id: "governance", label: "Governance", component: GovernancePanel },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("issuer");
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setHealth({ ok: false, error: e.message }));
  }, []);

  const ActiveComponent = TABS.find((t) => t.id === activeTab).component;

  return (
    <div className="app">
      <header className="app-header">
        <h1>VeriCred</h1>
        <p className="subtitle">Scalable, privacy-preserving academic credential verification — demo console</p>
        {health && (
          <p className={`status ${health.ok ? "ok" : "down"}`}>
            {health.ok ? `Connected to ${health.network}` : `Backend unreachable: ${health.error}`}
          </p>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === activeTab ? "active" : ""} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        <ActiveComponent />
      </main>
    </div>
  );
}
