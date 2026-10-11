import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../context";
import { Badge, Button, Card, Guide, Icon, PageHeader, useToast } from "../ui";

const STEPS = [
  { key: "issuer_membership", icon: "building", title: "Issuer membership", question: "Is the issuing institution an active member of the consortium?" },
  { key: "signature", icon: "key", title: "Issuer signature", question: "Was the batch root signed by the key that was valid when it was issued?" },
  { key: "merkle_proof", icon: "layers", title: "Merkle proof", question: "Do the disclosed fields rebuild the root stored on the blockchain?" },
  { key: "revocation_status", icon: "ban", title: "Revocation status", question: "Has the issuer revoked this credential since?" },
];
const pretty = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export default function Verifier() {
  const { session, setSession } = useApp();
  const toast = useToast();
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [shown, setShown] = useState(0);
  const [elapsed, setElapsed] = useState(null);
  const [tamperNote, setTamperNote] = useState(null);
  const [verified, setVerified] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (session.presentation) {
      setText(JSON.stringify(session.presentation, null, 2));
      setSession({ presentation: null });
      setResult(null);
      setTamperNote(null);
    }
  }, [session, setSession]);

  useEffect(() => {
    if (!result || shown >= STEPS.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [result, shown]);

  function parse() {
    try {
      const p = JSON.parse(text);
      if (p.batchId === undefined) throw new Error("This does not look like a presentation (no batchId).");
      setParseError(null);
      return p;
    } catch (e) {
      setParseError(e.message);
      return null;
    }
  }

  async function run(presentation, note = null) {
    setRunning(true);
    setResult(null);
    setShown(0);
    setTamperNote(note);
    setVerified(presentation);
    const t0 = performance.now();
    try {
      const r = await api.verifyPresentation(presentation);
      setElapsed(Math.round(performance.now() - t0));
      setResult(r);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setRunning(false);
    }
  }

  function verify() {
    const p = parse();
    if (p) run(p);
  }

  function tamper() {
    const p = parse();
    if (!p) return;
    const keys = Object.keys(p.disclosedFields);
    if (keys.length === 0) return toast("Nothing disclosed to tamper with.", "error");
    const k = keys.includes("degree") ? "degree" : keys[0];
    const original = p.disclosedFields[k].value;
    const forged = k === "degree" ? "PhD" : `${original} (forged)`;
    const copy = JSON.parse(JSON.stringify(p));
    copy.disclosedFields[k].value = forged;
    run(copy, `Simulated attack: "${pretty(k)}" changed from "${original}" to "${forged}" before verification.`);
  }

  async function readFile(file) {
    if (!file) return;
    setText(await file.text());
    setResult(null);
    toast(`Loaded ${file.name}`, "success");
  }

  const done = result && shown >= STEPS.length;
  const failedIndex = result ? result.checks.findIndex((c) => !c.passed) : -1;

  function statusOf(i) {
    if (!result || i >= shown) return running && i === 0 ? "running" : "idle";
    const c = result.checks[i];
    if (!c) return "skipped";
    return c.passed ? "pass" : "fail";
  }

  return (
    <>
      <PageHeader eyebrow="Role: Employer" title="Verify a credential against the blockchain">
        Paste or scan a presentation. Every trust decision is read from the chain, nothing the presentation claims about itself is trusted.
      </PageHeader>

      <Guide
        id="verifier"
        title="How to verify a credential"
        intro="Acts as the employer. No contact with the university is needed."
        steps={[
          { title: "Load a presentation", text: "Use Send to Verifier on the Holder page (it fills this box automatically), or paste the JSON or upload a .json file.", done: !!text.trim(), go: "holder", goLabel: "Create one in the Holder page" },
          { title: "Click Verify credential", text: "Four checks run against the blockchain, in order: issuer membership, issuer signature, Merkle proof, revocation status.", done: !!result },
          { title: "Read the verdict", text: "Green means every check passed and the shown claims are authentic. Red shows exactly which check failed and why.", done: !!done },
          { title: "Try to cheat it", text: "Click Simulate tampering. The degree is changed to PhD before verifying, and the Merkle proof check rejects it.", done: !!tamperNote },
          { title: "Try a revoked credential", text: "Revoke the student in the Issuer page, then verify the same presentation again. It now fails at the last check.", go: "issuer", goLabel: "Go to the issuer" },
        ]}
      />

      <div className="grid-verify">
        <Card title="Presentation" subtitle="JSON from the student, or the scanned QR payload" icon="file"
          actions={<><Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>Upload</Button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => readFile(e.target.files[0])} /></>}>
          <textarea className="code-area" rows={13} spellCheck={false} value={text} placeholder={'Paste the presentation JSON here, or use "Send to Verifier" on the Holder tab.'} onChange={(e) => { setText(e.target.value); setParseError(null); }} />
          {parseError && <div className="inline-error"><Icon name="alert" size={16} />{parseError}</div>}
          <div className="row gap wrap top-gap">
            <Button icon="verify" loading={running} disabled={!text.trim()} onClick={verify}>Verify credential</Button>
            <Button variant="secondary" icon="flask" disabled={!text.trim() || running} onClick={tamper}>Simulate tampering</Button>
          </div>
        </Card>

        <div className="stack">
          {tamperNote && <div className="note-tamper"><Icon name="flask" size={16} /> {tamperNote}</div>}

          {done && (
            <div className={`verdict ${result.valid ? "ok" : "bad"}`}>
              <div className="verdict-icon"><Icon name={result.valid ? "shield" : "alert"} size={30} /></div>
              <div>
                <h2>{result.valid ? "Credential verified" : "Verification failed"}</h2>
                <p>
                  {result.valid
                    ? `All 4 checks passed against the blockchain in ${elapsed} ms (round trip, including the chain reads).`
                    : `Stopped at check ${failedIndex + 1}: ${STEPS[failedIndex].title}. ${result.checks[failedIndex].reason}`}
                </p>
              </div>
            </div>
          )}

          <Card title="Verification pipeline" subtitle="Run in order; stops at the first failure" icon="activity" pad={false}>
            <ol className="pipeline">
              {STEPS.map((s, i) => {
                const st = statusOf(i);
                const c = result?.checks[i];
                return (
                  <li key={s.key} className={`step step-${st}`}>
                    <div className="step-marker">
                      {st === "pass" && <Icon name="check" size={16} strokeWidth={2.6} />}
                      {st === "fail" && <Icon name="x" size={16} strokeWidth={2.6} />}
                      {st === "running" && <span className="spinner dark" />}
                      {(st === "idle" || st === "skipped") && <span>{i + 1}</span>}
                    </div>
                    <div className="step-body">
                      <div className="step-title">
                        <strong>{s.title}</strong>
                        {st === "pass" && <Badge tone="green">Pass</Badge>}
                        {st === "fail" && <Badge tone="red">Fail</Badge>}
                        {st === "skipped" && <Badge tone="neutral">Not evaluated</Badge>}
                      </div>
                      <p>{c && i < shown ? c.reason : s.question}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          {done && verified && (
            <Card title="Claims in this presentation" subtitle={result.valid ? "Cryptographically verified" : "Not verified"} icon="cap" pad={false}>
              <table className="table compact">
                <tbody>
                  {verified.fieldOrder.map((k) => {
                    const d = verified.disclosedFields[k];
                    return (
                      <tr key={k}>
                        <td className="muted">{pretty(k)}</td>
                        <td>
                          {d ? <strong>{d.value}</strong> : <span className="muted italic"><Icon name="eyeoff" size={13} /> Not disclosed by the holder</span>}
                        </td>
                        <td className="right">{d && (result.valid ? <Badge tone="green" icon="check">Verified</Badge> : <Badge tone="red">Unverified</Badge>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
