import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context";
import { Badge, Button, Card, CopyButton, Empty, Guide, Hash, Icon, PageHeader, shortHash, useToast } from "../ui";

const SENSITIVE = /gpa|grade|mark|score|percent/i;
const pretty = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function CredentialCard({ c, selected, onSelect }) {
  const f = c.fields;
  return (
    <button className={`cred-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="cred-top">
        <span><Icon name="cap" size={16} /> Academic credential</span>
        <Badge tone="blue">Batch #{c.batchId}</Badge>
      </div>
      <div className="cred-name">{f.name || c.credentialDocument.credentialSubject.id}</div>
      <div className="cred-line">{[f.degree, f.major].filter(Boolean).join(" · ")}</div>
      <div className="cred-foot">
        <span>{f.graduationYear ? `Class of ${f.graduationYear}` : ""}</span>
        <span className="mono">{c.credentialDocument.issuer}</span>
      </div>
    </button>
  );
}

export default function Holder() {
  const { setSession, go } = useApp();
  const toast = useToast();

  const [subjectId, setSubjectId] = useState("S101");
  const [known, setKnown] = useState([]);
  const [credentials, setCredentials] = useState(null);
  const [selected, setSelected] = useState(null);
  const [share, setShare] = useState({});
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [output, setOutput] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { batches } = await api.listBatches();
        const seen = new Map();
        for (const b of batches) {
          const d = await api.getBatch(b.batchId);
          d.students.forEach((s) => seen.set(s.subjectId, s.fields.name || s.subjectId));
        }
        setKnown([...seen].map(([id, name]) => ({ id, name })));
      } catch {
        /* offline */
      }
    })();
  }, []);

  async function lookup(id = subjectId) {
    setLoading(true);
    setSelected(null);
    setOutput(null);
    try {
      const d = await api.holderCredentials(id);
      setCredentials(d.credentials);
      if (d.credentials.length === 1) choose(d.credentials[0]);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function choose(c) {
    setSelected(c);
    setOutput(null);
    const init = {};
    Object.keys(c.fields).forEach((k) => (init[k] = !SENSITIVE.test(k)));
    setShare(init);
  }

  function flip(k) {
    setShare((s) => ({ ...s, [k]: !s[k] }));
    setOutput(null);
  }

  async function generate() {
    setBuilding(true);
    try {
      const chosen = Object.keys(share).filter((k) => share[k]);
      if (chosen.length === 0) throw new Error("Share at least one field.");
      setOutput(await api.buildDisclosure(selected.batchId, selected.studentIndex, chosen));
      toast("Presentation generated", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBuilding(false);
    }
  }

  function sendToVerifier() {
    setSession({ presentation: output.presentation });
    toast("Presentation sent to the Verifier tab", "success");
    go("verifier");
  }

  function download() {
    const blob = new Blob([JSON.stringify(output.presentation, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `presentation-${selected.batchId}-${selected.studentIndex}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const p = output?.presentation;
  const sharedCount = Object.values(share).filter(Boolean).length;
  const total = Object.keys(share).length;

  return (
    <>
      <PageHeader eyebrow="Role: Student" title="Share only what the employer needs">
        Pick a credential, choose which fields to reveal, and generate a proof. Hidden fields are never sent, only an opaque salted hash, so the employer can confirm authenticity without learning the value.
      </PageHeader>

      <Guide
        id="holder"
        title="How to share a credential"
        intro="You decide exactly which fields the employer gets to see."
        steps={[
          { title: "Find your credentials", text: "Type your Student ID (for example S101) and click Find credentials, or click a name under Try. The issuer must have anchored a cohort first.", done: !!credentials && credentials.length > 0, go: "issuer", goLabel: "Issue a cohort first" },
          { title: "Select a credential", text: "If more than one card appears, click the one you want to share. A single credential is selected automatically.", done: !!selected },
          { title: "Choose what to reveal", text: "Use the switches. Hidden fields are replaced by an opaque hash. GPA starts hidden. The preview on the right shows what the employer will see.", done: !!selected && !!output },
          { title: "Generate the presentation", text: "Click Generate presentation. You get a QR code, the proof path, and a small JSON file.", done: !!output },
          { title: "Hand it to the employer", text: "Click Send to Verifier to try it straight away, or Download .json / Copy JSON to share it.", done: false },
        ]}
      />

      <Card title="Find your credentials" icon="cap">
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
          <label className="field grow">
            <span>Student ID</span>
            <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="e.g. S101" />
          </label>
          <Button icon="verify" loading={loading} type="submit" className="align-end">Find credentials</Button>
        </form>
        {known.length > 0 && (
          <div className="chips">
            <span className="muted">Try:</span>
            {known.slice(0, 8).map((k) => (
              <button key={k.id} type="button" className="chip" onClick={() => { setSubjectId(k.id); lookup(k.id); }}>
                {k.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {credentials && credentials.length === 0 && (
        <Card className="gap-top"><Empty icon="cap" title="No credentials found">Ask the issuer to anchor a cohort that includes this identifier.</Empty></Card>
      )}

      {credentials && credentials.length > 0 && (
        <div className="cred-grid gap-top">
          {credentials.map((c) => (
            <CredentialCard key={`${c.batchId}-${c.studentIndex}`} c={c} selected={selected && selected.batchId === c.batchId && selected.studentIndex === c.studentIndex} onSelect={() => choose(c)} />
          ))}
        </div>
      )}

      {selected && (
        <div className="grid-2 gap-top">
          <Card title="Choose what to share" subtitle={`${sharedCount} of ${total} fields shared`} icon="eye">
            <ul className="toggle-list">
              {Object.entries(selected.fields).map(([k, v]) => (
                <li key={k} className={share[k] ? "on" : "off"}>
                  <div>
                    <strong>{pretty(k)}</strong>
                    <span>{v}</span>
                  </div>
                  <button className={`switch ${share[k] ? "on" : ""}`} onClick={() => flip(k)} role="switch" aria-checked={!!share[k]} aria-label={`Share ${pretty(k)}`}>
                    <span />
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">Sensitive-looking fields such as GPA start hidden. Switch anything on or off.</p>
          </Card>

          <Card title="What the verifier will see" subtitle="Live preview" icon="verify">
            <ul className="preview-list">
              {Object.entries(selected.fields).map(([k, v]) => (
                <li key={k} className={share[k] ? "shown" : "hidden-f"}>
                  <span>{pretty(k)}</span>
                  {share[k] ? (
                    <strong>{v}</strong>
                  ) : (
                    <em><Icon name="eyeoff" size={14} /> hidden - hash only</em>
                  )}
                </li>
              ))}
            </ul>
            <Button icon="qr" loading={building} onClick={generate} className="wide">Generate presentation</Button>
          </Card>
        </div>
      )}

      {p && (
        <Card title="Presentation ready" subtitle="Hand this to the employer as a QR code or file" icon="shield" className="gap-top result-card">
          <div className="present-grid">
            <div className="qr-box">
              <img src={output.qrDataUrl} alt="QR code containing the presentation" />
              <span>{output.qrPayloadBytes} bytes</span>
            </div>
            <div className="stack">
              <div className="mini-stats">
                <div><span>Fields shared</span><strong>{Object.keys(p.disclosedFields).length} / {p.fieldOrder.length}</strong></div>
                <div><span>Proof depth</span><strong>{p.batchLeafProof.length} hashes</strong></div>
                <div><span>Batch</span><strong>#{p.batchId}</strong></div>
              </div>
              <div className="row gap wrap">
                <Button icon="arrow" onClick={sendToVerifier}>Send to Verifier</Button>
                <Button variant="secondary" icon="download" onClick={download}>Download .json</Button>
                <Button variant="secondary" icon="copy" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(p)); toast("Presentation JSON copied", "success"); }}>Copy JSON</Button>
              </div>
              <div className="proof-path">
                <h4>Proof path to the on-chain root</h4>
                <ol>
                  <li><span>Student root</span><code>{shortHash(p.studentRoot, 12, 8)}</code></li>
                  {p.batchLeafProof.map((s, i) => (
                    <li key={i}><span>Sibling hash {i + 1}</span><code>{shortHash(s.sibling, 12, 8)}</code></li>
                  ))}
                  <li className="root"><span>Batch root (anchored on-chain)</span><code>{shortHash(p.batchRoot, 12, 8)}</code></li>
                </ol>
              </div>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
