import { Fragment, useEffect, useState } from "react";
import { api } from "../api";

export default function IssuerPanel() {
  const [institutions, setInstitutions] = useState([]);
  const [institutionAddress, setInstitutionAddress] = useState("");
  const [csvText, setCsvText] = useState(
    "subjectId,name,degree,major,graduationYear,gpa\n" +
      "did:example:student1,Asha Rao,B.Tech,CSE,2025,9.1\n" +
      "did:example:student2,Ben Iyer,B.Tech,ECE,2025,8.4\n" +
      "did:example:student3,Chitra Nair,M.Tech,CSE,2025,9.6\n"
  );
  const [parsedCohort, setParsedCohort] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [issueResult, setIssueResult] = useState(null);
  const [error, setError] = useState(null);

  const [batches, setBatches] = useState([]);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [revokeStatus, setRevokeStatus] = useState({});

  useEffect(() => {
    api.listInstitutions().then((d) => {
      setInstitutions(d.institutions);
      if (d.institutions.length > 0) setInstitutionAddress(d.institutions[0].institutionAddress);
    }).catch((e) => setError(e.message));
    refreshBatches();
  }, []);

  function refreshBatches() {
    api.listBatches().then((d) => setBatches(d.batches)).catch(() => {});
  }

  function parseCsv() {
    setError(null);
    try {
      const lines = csvText.trim().split("\n").map((l) => l.split(","));
      const header = lines[0].map((h) => h.trim());
      const cohort = lines.slice(1).map((row) => {
        const record = {};
        header.forEach((h, i) => (record[h] = (row[i] || "").trim()));
        const { subjectId, ...fields } = record;
        return { subjectId, fields };
      });
      setParsedCohort(cohort);
    } catch (e) {
      setError("Could not parse CSV: " + e.message);
    }
  }

  async function issueBatch() {
    if (!parsedCohort || !institutionAddress) return;
    setIssuing(true);
    setError(null);
    setIssueResult(null);
    try {
      const result = await api.issueBatch(institutionAddress, parsedCohort, `demo://cohort-${Date.now()}`);
      setIssueResult(result);
      refreshBatches();
    } catch (e) {
      setError(e.message);
    } finally {
      setIssuing(false);
    }
  }

  async function toggleExpand(batchId) {
    if (expandedBatch?.batchId === batchId) {
      setExpandedBatch(null);
      return;
    }
    const detail = await api.getBatch(batchId);
    setExpandedBatch({ batchId, ...detail });
  }

  async function revokeCredential(batch, studentIndex) {
    const credentialId = ((BigInt(batch.batchId) << 32n) | BigInt(studentIndex)).toString();
    setRevokeStatus((s) => ({ ...s, [credentialId]: "revoking" }));
    try {
      await api.revoke(batch.institutionAddress, credentialId);
      setRevokeStatus((s) => ({ ...s, [credentialId]: "revoked" }));
    } catch (e) {
      setRevokeStatus((s) => ({ ...s, [credentialId]: "error: " + e.message }));
    }
  }

  return (
    <div className="panel">
      <h2>Issuer — batch-issue a cohort</h2>
      <p className="hint">
        Upload/paste a CSV with a <code>subjectId</code> column plus one column per credential field. One transaction
        anchors the whole cohort's Merkle root (contribution C1) — the on-chain cost does not grow with cohort size.
      </p>

      <label>
        Issuing institution
        <select value={institutionAddress} onChange={(e) => setInstitutionAddress(e.target.value)}>
          {institutions.map((i) => (
            <option key={i.institutionAddress} value={i.institutionAddress} disabled={!i.active}>
              {i.name} {i.active ? "" : "(inactive)"} — {i.institutionAddress.slice(0, 10)}…
            </option>
          ))}
        </select>
      </label>

      <label>
        Cohort CSV
        <textarea rows={6} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
      </label>

      <div className="row">
        <button onClick={parseCsv}>Parse CSV</button>
        <button onClick={issueBatch} disabled={!parsedCohort || issuing || !institutionAddress}>
          {issuing ? "Issuing…" : `Issue batch${parsedCohort ? ` (${parsedCohort.length} students)` : ""}`}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {parsedCohort && (
        <table className="data-table">
          <thead>
            <tr>
              <th>subjectId</th>
              {Object.keys(parsedCohort[0].fields).map((f) => (
                <th key={f}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsedCohort.map((s) => (
              <tr key={s.subjectId}>
                <td>{s.subjectId}</td>
                {Object.values(s.fields).map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {issueResult && (
        <div className="callout success">
          Anchored batch #{issueResult.batchId} — root {issueResult.batchRoot.slice(0, 18)}… — gas used{" "}
          {issueResult.gasUsed} — tx {issueResult.txHash.slice(0, 14)}…
        </div>
      )}

      <h3>Anchored batches</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>batchId</th>
            <th>institution</th>
            <th>students</th>
            <th>issuanceDate</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <Fragment key={b.batchId}>
              <tr>
                <td>{b.batchId}</td>
                <td>{b.institutionAddress.slice(0, 10)}…</td>
                <td>{b.studentCount}</td>
                <td>{new Date(b.issuanceDate).toLocaleString()}</td>
                <td>
                  <button onClick={() => toggleExpand(b.batchId)}>
                    {expandedBatch?.batchId === b.batchId ? "Hide" : "Details / revoke"}
                  </button>
                </td>
              </tr>
              {expandedBatch?.batchId === b.batchId && (
                <tr>
                  <td colSpan={5}>
                    <table className="data-table nested">
                      <thead>
                        <tr>
                          <th>subjectId</th>
                          <th>credentialId</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedBatch.students.map((s) => {
                          const credentialId = ((BigInt(b.batchId) << 32n) | BigInt(s.leafIndexInBatch)).toString();
                          const status = revokeStatus[credentialId];
                          return (
                            <tr key={s.subjectId}>
                              <td>{s.subjectId}</td>
                              <td>{credentialId}</td>
                              <td>
                                {status === "revoked" ? (
                                  <span className="badge fail">revoked</span>
                                ) : (
                                  <button onClick={() => revokeCredential(b, s.leafIndexInBatch)}>
                                    {status === "revoking" ? "Revoking…" : "Revoke"}
                                  </button>
                                )}
                                {status && status.startsWith("error") && <span className="error">{status}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
