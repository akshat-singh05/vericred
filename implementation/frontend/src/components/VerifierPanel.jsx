import { useState } from "react";
import { api } from "../api";

const CHECK_LABELS = {
  issuer_membership: "1. Issuer membership",
  signature: "2. Signature (issued-time key)",
  merkle_proof: "3. Merkle proof vs. on-chain root",
  revocation_status: "4. Revocation status",
};

export default function VerifierPanel() {
  const [presentationText, setPresentationText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const presentation = JSON.parse(presentationText);
      const r = await api.verifyPresentation(presentation);
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Verifier — paste a presentation (or a scanned QR payload)</h2>
      <p className="hint">
        Runs, in order: issuer membership → signature (checked against the key valid at issuance time) → Merkle proof
        against the on-chain anchored root → revocation status. Every trust anchor is read from the chain, not
        trusted from the presentation itself.
      </p>

      <textarea
        rows={8}
        placeholder="Paste the presentation JSON copied from the Holder tab…"
        value={presentationText}
        onChange={(e) => setPresentationText(e.target.value)}
      />
      <button onClick={verify} disabled={!presentationText || loading}>
        {loading ? "Verifying…" : "Verify"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className={`callout ${result.valid ? "success" : "fail"}`}>
          <strong>{result.valid ? "VALID" : "INVALID"}</strong>
          <ul className="check-list">
            {result.checks.map((c) => (
              <li key={c.name} className={c.passed ? "pass" : "fail"}>
                <span className="badge">{c.passed ? "PASS" : "FAIL"}</span> {CHECK_LABELS[c.name] || c.name}
                <div className="reason">{c.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
