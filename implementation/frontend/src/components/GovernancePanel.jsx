import { useEffect, useState } from "react";
import { api, PROPOSAL_TYPE_NAMES } from "../api";

export default function GovernancePanel() {
  const [members, setMembers] = useState([]);
  const [threshold, setThreshold] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [error, setError] = useState(null);

  const [proposerAddress, setProposerAddress] = useState("");
  const [type, setType] = useState("AddInstitution");
  const [institutionAddress, setInstitutionAddress] = useState("");
  const [did, setDid] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [voterAddress, setVoterAddress] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const m = await api.governanceMembers();
      setMembers(m.members);
      setThreshold(m.threshold);
      if (m.members.length > 0) {
        setProposerAddress(m.members[0]);
        setVoterAddress(m.members[0]);
      }
      const p = await api.governanceProposals();
      setProposals(p.proposals);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitProposal() {
    setError(null);
    try {
      await api.proposeGovernance({
        proposerAddress,
        type,
        institutionAddress,
        did: type === "AddInstitution" ? did : undefined,
        institutionName: type === "AddInstitution" ? institutionName : undefined,
      });
      setInstitutionAddress("");
      setDid("");
      setInstitutionName("");
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function vote(proposalId) {
    setError(null);
    try {
      await api.voteGovernance(proposalId, voterAddress);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="panel">
      <h2>Consortium governance — {threshold}-of-{members.length} multisig</h2>
      <p className="hint">
        New universities are onboarded or removed, and issuer signing keys are rotated, only by M-of-N member vote
        (contribution C3) — no single institution controls the registry.
      </p>

      <h3>Members</h3>
      <ul>
        {members.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>

      <h3>Propose</h3>
      <div className="card">
        <label>
          Proposer (must be a member)
          <select value={proposerAddress} onChange={(e) => setProposerAddress(e.target.value)}>
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proposal type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {PROPOSAL_TYPE_NAMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Institution address
          <input value={institutionAddress} onChange={(e) => setInstitutionAddress(e.target.value)} placeholder="0x…" />
        </label>
        {type === "AddInstitution" && (
          <>
            <label>
              Institution name
              <input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} placeholder="University C" />
            </label>
            <label>
              DID
              <input value={did} onChange={(e) => setDid(e.target.value)} placeholder="did:vericred:university-c" />
            </label>
          </>
        )}
        <button onClick={submitProposal} disabled={!proposerAddress || !institutionAddress}>
          Submit proposal
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <h3>Proposals</h3>
      <label>
        Vote as
        <select value={voterAddress} onChange={(e) => setVoterAddress(e.target.value)}>
          {members.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>type</th>
            <th>institution</th>
            <th>votes</th>
            <th>status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => (
            <tr key={p.proposalId}>
              <td>{p.proposalId}</td>
              <td>{PROPOSAL_TYPE_NAMES[p.proposalType]}</td>
              <td>{p.institution.slice(0, 10)}…</td>
              <td>
                {p.votesFor}/{threshold}
              </td>
              <td>
                <span className={`badge ${p.executed ? "pass" : ""}`}>{p.executed ? "executed" : "pending"}</span>
              </td>
              <td>
                {!p.executed && (
                  <button onClick={() => vote(p.proposalId)} disabled={!voterAddress}>
                    Vote
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
