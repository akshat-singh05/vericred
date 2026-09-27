import { useState } from "react";
import { api } from "../api";

export default function HolderPanel() {
  const [subjectId, setSubjectId] = useState("did:example:student1");
  const [credentials, setCredentials] = useState(null);
  const [selected, setSelected] = useState(null); // {batchId, studentIndex, fields}
  const [disclosedFields, setDisclosedFields] = useState({});
  const [disclosure, setDisclosure] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setError(null);
    setCredentials(null);
    setSelected(null);
    setDisclosure(null);
    try {
      const d = await api.holderCredentials(subjectId);
      setCredentials(d.credentials);
    } catch (e) {
      setError(e.message);
    }
  }

  function selectCredential(c) {
    setSelected(c);
    setDisclosure(null);
    const initial = {};
    Object.keys(c.fields).forEach((f) => (initial[f] = true));
    setDisclosedFields(initial);
  }

  async function createDisclosure() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const chosen = Object.entries(disclosedFields).filter(([, v]) => v).map(([f]) => f);
      const d = await api.buildDisclosure(selected.batchId, selected.studentIndex, chosen);
      setDisclosure(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function copyPresentation() {
    navigator.clipboard.writeText(JSON.stringify(disclosure.presentation));
  }

  return (
    <div className="panel">
      <h2>Holder — view credentials & create a selective disclosure</h2>
      <p className="hint">
        Choose which fields to reveal (contribution C1). Undisclosed fields stay as opaque leaf hashes — the verifier
        can confirm authenticity without learning their value.
      </p>

      <label>
        Subject DID
        <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
      </label>
      <button onClick={lookup}>Look up credentials</button>

      {error && <p className="error">{error}</p>}

      {credentials && credentials.length === 0 && <p className="hint">No credentials found for this subject.</p>}

      {credentials && credentials.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>batchId</th>
              <th>issuer</th>
              <th>fields</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <tr key={`${c.batchId}-${c.studentIndex}`}>
                <td>{c.batchId}</td>
                <td>{c.credentialDocument.issuer}</td>
                <td>{Object.keys(c.fields).join(", ")}</td>
                <td>
                  <button onClick={() => selectCredential(c)}>Select</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="card">
          <h3>Choose fields to disclose</h3>
          {Object.entries(selected.fields).map(([field, value]) => (
            <label key={field} className="checkbox-row">
              <input
                type="checkbox"
                checked={!!disclosedFields[field]}
                onChange={(e) => setDisclosedFields((s) => ({ ...s, [field]: e.target.checked }))}
              />
              {field}: <strong>{value}</strong>
            </label>
          ))}
          <button onClick={createDisclosure} disabled={loading}>
            {loading ? "Building…" : "Create selective-disclosure presentation"}
          </button>
        </div>
      )}

      {disclosure && (
        <div className="card">
          <h3>Presentation ready</h3>
          <p className="hint">QR payload: {disclosure.qrPayloadBytes} bytes</p>
          <img src={disclosure.qrDataUrl} alt="Verification QR code" width={220} height={220} />
          <div className="row">
            <button onClick={copyPresentation}>Copy presentation JSON</button>
          </div>
          <details>
            <summary>Raw presentation JSON</summary>
            <pre className="json-block">{JSON.stringify(disclosure.presentation, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
