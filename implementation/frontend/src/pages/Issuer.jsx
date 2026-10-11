import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { INDIVIDUAL_GAS_PER_CREDENTIAL, credentialIdFor, useApp } from "../context";
import { Badge, Button, Card, Empty, Guide, Hash, Icon, PageHeader, fmtNum, useToast } from "../ui";

const SAMPLE_CSV =
  "studentId,name,degree,major,graduationYear,gpa\n" +
  "S101,Asha Rao,B.Tech,CSE,2025,9.1\n" +
  "S102,Ben Iyer,B.Tech,ECE,2025,8.4\n" +
  "S103,Chitra Nair,M.Tech,CSE,2025,9.6\n";

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "Add a header row and at least one student row." };
  const header = lines[0].split(",").map((h) => (/^(studentid|id)$/i.test(h.trim()) ? "subjectId" : h.trim()));
  if (!header.includes("subjectId")) return { error: 'The header must include a "studentId" column.' };
  const cohort = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    if (cells.length !== header.length) return { error: `Row ${i} has ${cells.length} values but the header has ${header.length}.` };
    const rec = {};
    header.forEach((h, k) => (rec[h] = cells[k]));
    const { subjectId, ...fields } = rec;
    if (!subjectId) return { error: `Row ${i} is missing a student ID.` };
    cohort.push({ subjectId, fields });
  }
  return { cohort, fieldNames: header.filter((h) => h !== "subjectId") };
}

function SavingsBar({ n, gas }) {
  const individual = n * INDIVIDUAL_GAS_PER_CREDENTIAL;
  const max = Math.max(individual, gas);
  const saved = individual - gas;
  return (
    <div className="savings">
      <div className="savings-row">
        <span>This batch (1 transaction)</span>
        <div className="bar-track"><div className="bar bar-accent" style={{ width: `${(gas / max) * 100}%` }} /></div>
        <strong>{fmtNum(gas)} gas</strong>
      </div>
      <div className="savings-row">
        <span>{fmtNum(n)} separate transactions (estimate)</span>
        <div className="bar-track"><div className="bar bar-muted" style={{ width: `${(individual / max) * 100}%` }} /></div>
        <strong>{fmtNum(individual)} gas</strong>
      </div>
      {saved > 0 ? (
        <p className="savings-note ok">
          <Icon name="check" size={14} /> {Math.round((saved / individual) * 100)}% less gas ({(individual / gas).toFixed(1)}x cheaper). The gap widens with every extra credential, because the batch cost stays flat.
        </p>
      ) : (
        <p className="savings-note">
          Batching has a fixed overhead, so for a cohort this small individual issuance is cheaper. It pays off from about two credentials upward.
        </p>
      )}
      <p className="savings-foot">Individual estimate: {fmtNum(INDIVIDUAL_GAS_PER_CREDENTIAL)} gas per credential, the measured mean of 30 on-chain calls.</p>
    </div>
  );
}

export default function Issuer() {
  const { refreshStats, labelFor } = useApp();
  const toast = useToast();

  const [institutions, setInstitutions] = useState([]);
  const [institutionAddress, setInstitutionAddress] = useState("");
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [dragging, setDragging] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});
  const [confirmId, setConfirmId] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const fileRef = useRef(null);

  const parsed = parseCsv(csv);

  const loadBatches = useCallback(async () => {
    try {
      setBatches((await api.listBatches()).batches.sort((a, b) => b.batchId - a.batchId));
    } catch {
      /* backend offline: the shell shows a banner */
    }
  }, []);

  useEffect(() => {
    api
      .listInstitutions()
      .then((d) => {
        setInstitutions(d.institutions);
        const first = d.institutions.find((i) => i.active);
        if (first) setInstitutionAddress(first.institutionAddress);
      })
      .catch(() => {});
    loadBatches();
  }, [loadBatches]);

  async function readFile(file) {
    if (!file) return;
    setCsv(await file.text());
    toast(`Loaded ${file.name}`, "success");
  }

  async function issue() {
    if (!parsed.cohort || !institutionAddress) return;
    setIssuing(true);
    setResult(null);
    try {
      const res = await api.issueBatch(institutionAddress, parsed.cohort, `demo://cohort-${Date.now()}`);
      setResult({ ...res, gasUsed: Number(res.gasUsed), n: parsed.cohort.length, institution: institutionAddress });
      toast(`Batch #${res.batchId} anchored on-chain`, "success");
      await Promise.all([loadBatches(), refreshStats()]);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setIssuing(false);
    }
  }

  async function toggle(batch) {
    if (expanded === batch.batchId) return setExpanded(null);
    setExpanded(batch.batchId);
    await loadDetail(batch.batchId);
  }

  async function loadDetail(batchId) {
    const d = await api.getBatch(batchId);
    const statuses = await Promise.all(
      d.students.map((s) => api.revocationStatus(credentialIdFor(batchId, s.leafIndexInBatch)).then((r) => r.revoked).catch(() => false))
    );
    setDetail((m) => ({ ...m, [batchId]: { institutionAddress: d.institutionAddress, students: d.students.map((s, i) => ({ ...s, revoked: statuses[i] })) } }));
  }

  async function revoke(batchId, student) {
    const id = credentialIdFor(batchId, student.leafIndexInBatch);
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((c) => (c === id ? null : c)), 4000);
      return;
    }
    setRevoking(id);
    try {
      const r = await api.revoke(detail[batchId].institutionAddress, id);
      toast(`Credential revoked (${fmtNum(r.gasUsed)} gas)`, "success");
      setConfirmId(null);
      await Promise.all([loadDetail(batchId), refreshStats()]);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Role: University" title="Issue credentials to a graduating cohort">
        Upload the cohort once. Every student's credential is hashed field by field, combined into a Merkle tree, and only the single root is written to the blockchain.
      </PageHeader>

      <Guide
        id="issuer"
        title="How to issue credentials"
        intro="Five steps. Takes about a minute with the sample data."
        steps={[
          { title: "Choose the issuing university", text: "Pick from the dropdown in card 1. Only universities admitted by a governance vote can issue.", done: !!institutionAddress },
          { title: "Load the cohort", text: "In card 2 click Load sample, upload a CSV, or paste one. It needs a studentId column plus one column per field (name, degree, ...).", done: !!parsed.cohort },
          { title: "Click Issue batch", text: "In card 3. The whole cohort is hashed into a Merkle tree and only its root is written to the blockchain in a single transaction.", done: !!result },
          { title: "Read the result", text: "The panel on the right shows the Merkle root, the transaction hash, the gas used and the saving against issuing one credential at a time.", done: !!result },
          { title: "Optional: revoke a credential", text: "In Anchored batches, click a batch row to expand it, then Revoke next to a student and confirm. Verifying that student again will now fail.", go: "verifier", goLabel: "Go to the verifier" },
        ]}
      />

      <div className="grid-issue">
        <div className="stack">
          <Card title="1. Choose the issuing institution" icon="building">
            <label className="field">
              <span>Issuing university</span>
              <select value={institutionAddress} onChange={(e) => setInstitutionAddress(e.target.value)}>
                {institutions.map((i) => (
                  <option key={i.institutionAddress} value={i.institutionAddress} disabled={!i.active}>
                    {labelFor(i.institutionAddress)} {i.active ? "" : "(inactive)"} - {i.did}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">Only institutions an M-of-N governance vote has admitted can anchor batches; the contract rejects everyone else.</p>
          </Card>

          <Card
            title="2. Provide the cohort data"
            subtitle="CSV with a studentId column plus one column per credential field"
            icon="file"
            actions={
              <>
                <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>Upload CSV</Button>
                <Button variant="ghost" onClick={() => setCsv(SAMPLE_CSV)}>Load sample</Button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => readFile(e.target.files[0])} />
              </>
            }
          >
            <div
              className={`dropzone ${dragging ? "drag" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); }}
            >
              <textarea rows={6} spellCheck={false} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Cohort CSV" />
              <span className="drop-hint">Drop a .csv file here or edit the text</span>
            </div>

            {parsed.error ? (
              <div className="inline-error"><Icon name="alert" size={16} />{parsed.error}</div>
            ) : (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr><th>Student ID</th>{parsed.fieldNames.map((f) => <th key={f}>{f}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.cohort.slice(0, 6).map((s) => (
                      <tr key={s.subjectId}>
                        <td className="mono">{s.subjectId}</td>
                        {parsed.fieldNames.map((f) => <td key={f}>{s.fields[f]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.cohort.length > 6 && <p className="hint">Showing 6 of {fmtNum(parsed.cohort.length)} students.</p>}
              </div>
            )}
          </Card>

          <Card title="3. Anchor on the blockchain" icon="layers">
            <div className="row between wrap">
              <p className="hint grow">
                {parsed.cohort ? <>Ready to anchor <strong>{fmtNum(parsed.cohort.length)}</strong> credentials ({parsed.fieldNames.length} fields each) in one transaction.</> : "Fix the CSV above to continue."}
              </p>
              <Button icon="layers" loading={issuing} disabled={!parsed.cohort || !institutionAddress} onClick={issue}>
                {issuing ? "Anchoring…" : "Issue batch"}
              </Button>
            </div>
          </Card>
        </div>

        <div className="stack">
          {result ? (
            <Card title={`Batch #${result.batchId} anchored`} subtitle="Confirmed on the chain" icon="shield" className="result-card">
              <div className="mini-stats">
                <div><span>Credentials</span><strong>{fmtNum(result.n)}</strong></div>
                <div><span>Transactions</span><strong>1</strong></div>
                <div><span>Gas used</span><strong>{fmtNum(result.gasUsed)}</strong></div>
              </div>
              <dl className="kv">
                <dt>Merkle root</dt><dd><Hash value={result.batchRoot} head={14} tail={10} label="Merkle root" /></dd>
                <dt>Transaction</dt><dd><Hash value={result.txHash} head={14} tail={10} label="Transaction hash" /></dd>
                <dt>Issuer</dt><dd>{labelFor(result.institution)}</dd>
              </dl>
              <SavingsBar n={result.n} gas={result.gasUsed} />
            </Card>
          ) : (
            <Card title="What happens when you issue" icon="activity">
              <ol className="how-list">
                <li><strong>Salt and hash.</strong> Each field of each student gets its own random salt, so hidden fields can never be guessed.</li>
                <li><strong>Build the tree.</strong> Student roots are combined into one batch root.</li>
                <li><strong>Sign and anchor.</strong> The issuer signs the root and one transaction records it on-chain.</li>
                <li><strong>Hand out proofs.</strong> Each student receives what they need to prove their own credential.</li>
              </ol>
            </Card>
          )}
        </div>
      </div>

      <Card title="Anchored batches" subtitle="Expand a batch to see its credentials and revoke any of them" icon="layers" className="gap-top" pad={false}>
        {batches.length === 0 ? (
          <Empty icon="layers" title="No batches anchored yet">Issue the sample cohort above to see it here.</Empty>
        ) : (
          <div className="table-wrap flush">
            <table className="table">
              <thead>
                <tr><th>Batch</th><th>Issuer</th><th>Credentials</th><th>Anchored</th><th /></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <Fragment key={b.batchId}>
                    <tr className="clickable" onClick={() => toggle(b)}>
                      <td><strong>#{b.batchId}</strong></td>
                      <td>{labelFor(b.institutionAddress)}</td>
                      <td>{fmtNum(b.studentCount)}</td>
                      <td>{new Date(b.issuanceDate).toLocaleString()}</td>
                      <td className="right"><Icon name="chevron" size={16} className={expanded === b.batchId ? "rot" : ""} /></td>
                    </tr>
                    {expanded === b.batchId && (
                      <tr className="detail-row">
                        <td colSpan={5}>
                          {!detail[b.batchId] ? (
                            <span className="muted">Loading…</span>
                          ) : (
                            <table className="table nested">
                              <thead><tr><th>Student</th><th>Credential id</th><th>Status</th><th /></tr></thead>
                              <tbody>
                                {detail[b.batchId].students.map((s) => {
                                  const id = credentialIdFor(b.batchId, s.leafIndexInBatch);
                                  return (
                                    <tr key={s.subjectId}>
                                      <td><span className="mono">{s.subjectId}</span> <span className="muted">{s.fields.name}</span></td>
                                      <td className="mono">{id}</td>
                                      <td>{s.revoked ? <Badge tone="red" icon="ban">Revoked</Badge> : <Badge tone="green" icon="check">Valid</Badge>}</td>
                                      <td className="right">
                                        {!s.revoked && (
                                          <Button variant={confirmId === id ? "danger" : "ghost"} icon="ban" loading={revoking === id} onClick={() => revoke(b.batchId, s)}>
                                            {confirmId === id ? "Confirm revoke" : "Revoke"}
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
