import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { PROPOSAL_TYPES, useApp } from "../context";
import { Badge, Button, Card, Empty, Guide, Hash, Icon, PageHeader, timeAgo, useToast } from "../ui";

const KINDS = [
  { id: "AddInstitution", label: "Add institution", icon: "plus", blurb: "Admit a new university as an issuer." },
  { id: "RemoveInstitution", label: "Remove institution", icon: "ban", blurb: "Revoke an institution's right to issue." },
  { id: "RotateKey", label: "Rotate signing key", icon: "key", blurb: "Replace an issuer's signing key; old signatures stay valid." },
];

function randomAddress() {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return "0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function friendly(msg) {
  if (/already voted/i.test(msg)) return "This member has already voted on that proposal.";
  if (/not a member|only member/i.test(msg)) return "Only consortium members can do this.";
  if (/executed/i.test(msg)) return "That proposal has already been executed.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

function ThresholdRing({ threshold, total }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" width="132" height="132" role="img" aria-label={`${threshold} of ${total} approvals required`}>
        <circle cx="60" cy="60" r={r} className="ring-bg" />
        <circle cx="60" cy="60" r={r} className="ring-fg" strokeDasharray={`${c * (threshold / total)} ${c}`} transform="rotate(-90 60 60)" />
        <text x="60" y="58" textAnchor="middle" className="ring-big">{threshold}/{total}</text>
        <text x="60" y="76" textAnchor="middle" className="ring-small">to approve</text>
      </svg>
    </div>
  );
}

export default function Governance() {
  const { labelFor, refreshStats } = useApp();
  const toast = useToast();
  const [members, setMembers] = useState([]);
  const [threshold, setThreshold] = useState(0);
  const [proposals, setProposals] = useState([]);
  const [actor, setActor] = useState("");
  const [kind, setKind] = useState("AddInstitution");
  const [target, setTarget] = useState("");
  const [did, setDid] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(null);
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState({ created: false, executed: false });

  const load = useCallback(async () => {
    try {
      const m = await api.governanceMembers();
      setMembers(m.members);
      setThreshold(m.threshold);
      setActor((a) => a || m.members[0] || "");
      setProposals((await api.governanceProposals()).proposals.slice().reverse());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needsDid = kind === "AddInstitution";
  const valid = /^0x[0-9a-fA-F]{40}$/.test(target) && (!needsDid || did.trim());

  async function propose(e) {
    e.preventDefault();
    setBusy("propose");
    try {
      const r = await api.proposeGovernance({
        proposerAddress: actor,
        type: kind,
        institutionAddress: target,
        did: needsDid ? did.trim() : undefined,
        institutionName: needsDid ? name.trim() || did.trim() : undefined,
      });
      toast(`Proposal #${r.proposalId} created (proposer's vote counted)`, "success");
      setTarget("");
      setDid("");
      setName("");
      setProgress((p) => ({ ...p, created: true }));
      await load();
      refreshStats();
    } catch (err) {
      toast(friendly(err.message), "error");
    } finally {
      setBusy(null);
    }
  }

  async function vote(id) {
    setBusy(id);
    try {
      const r = await api.voteGovernance(id, actor);
      toast(r.executed ? `Proposal #${id} reached the threshold and was executed` : `Vote recorded (${r.votesFor}/${threshold})`, "success");
      if (r.executed) setProgress((p) => ({ ...p, executed: true }));
      await load();
      refreshStats();
    } catch (err) {
      toast(friendly(err.message), "error");
    } finally {
      setBusy(null);
    }
  }

  const open = proposals.filter((p) => !p.executed);
  const closed = proposals.filter((p) => p.executed);

  function ProposalCard({ p }) {
    const pct = Math.min(100, (p.votesFor / Math.max(threshold, 1)) * 100);
    return (
      <div className={`proposal ${p.executed ? "done" : ""}`}>
        <div className="proposal-top">
          <div>
            <span className="proposal-id">Proposal #{p.proposalId}</span>
            <h4>{PROPOSAL_TYPES[p.proposalType]}</h4>
          </div>
          {p.executed ? <Badge tone="green" icon="check">Executed</Badge> : <Badge tone="amber" icon="clock">Open</Badge>}
        </div>
        <dl className="kv">
          <div><dt>Institution</dt><dd>{labelFor(p.institution)} <Hash value={p.institution} head={6} tail={4} label="Address" /></dd></div>
          {p.did && <div><dt>DID</dt><dd className="mono">{p.did}</dd></div>}
          <div><dt>Created</dt><dd>{timeAgo(p.createdAt)}</dd></div>
        </dl>
        <div className="votebar" aria-label={`${p.votesFor} of ${threshold} votes`}>
          <div className="votebar-track"><div className="votebar-fill" style={{ width: `${pct}%` }} /></div>
          <span>{p.votesFor} / {threshold} approvals</span>
        </div>
        {!p.executed && (
          <Button variant="secondary" icon="check" loading={busy === p.proposalId} onClick={() => vote(p.proposalId)}>
            Vote as {labelFor(actor)}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Role: Consortium member" title="Decentralised governance">
        No single party controls who may issue credentials. A change takes effect only once {threshold || "M"} of {members.length || "N"} members approve it on-chain.
      </PageHeader>

      <Guide
        id="governance"
        title="How to admit a new university"
        intro="Changes need approval from 2 of the 3 members, so no one acts alone."
        steps={[
          { title: "Choose who you are acting as", text: "Pick a member in the Acting as box. Every vote and proposal is signed by that member.", done: !!actor },
          { title: "Create a proposal", text: "Pick Add institution, click Generate for a test wallet address, enter a DID (for example did:vericred:university-c) and a display name, then Submit.", done: progress.created },
          { title: "The proposer's vote counts", text: "The new proposal shows 1 of 2 approvals. It stays open until another member approves.", done: progress.created },
          { title: "Vote as a different member", text: "Change Acting as to another member and click Vote on the open proposal. At 2 of 2 the contract executes it automatically.", done: progress.executed },
          { title: "Use the new institution", text: "Once executed, the new university appears in the Issuer page and can anchor credentials.", go: "issuer", goLabel: "Open the issuer" },
        ]}
      />

      {offline && <Card><Empty icon="alert" title="Governance data unavailable">Start the backend and refresh.</Empty></Card>}

      <div className="grid-gov">
        <Card title="Consortium" subtitle={`${members.length} member institutions`} icon="users">
          <div className="gov-summary">
            <ThresholdRing threshold={threshold || 1} total={members.length || 1} />
            <p>Approval threshold. Updates to the membership list, including key rotation, are executed automatically by the contract when the threshold is reached.</p>
          </div>
          <label className="field top-gap">
            <span>Acting as</span>
            <select value={actor} onChange={(e) => setActor(e.target.value)}>
              {members.map((m) => (
                <option key={m} value={m}>{labelFor(m)}</option>
              ))}
            </select>
          </label>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m} className={m === actor ? "active" : ""} onClick={() => setActor(m)}>
                <span className="avatar">{labelFor(m).slice(0, 1)}</span>
                <div>
                  <strong>{labelFor(m)}</strong>
                  <Hash value={m} head={8} tail={6} label="Address" />
                </div>
                {m === actor && <Badge tone="blue">Acting</Badge>}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="New proposal" subtitle="The proposer's own vote is counted automatically" icon="plus">
          <div className="kind-picker" role="radiogroup">
            {KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`kind ${kind === k.id ? "active" : ""}`} onClick={() => setKind(k.id)}>
                <Icon name={k.icon} size={18} />
                <strong>{k.label}</strong>
                <span>{k.blurb}</span>
              </button>
            ))}
          </div>
          <form onSubmit={propose} className="form-stack">
            <label className="field">
              <span>{kind === "RotateKey" ? "Institution address" : "Institution wallet address"}</span>
              <div className="input-row">
                <input value={target} onChange={(e) => setTarget(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
                {kind === "AddInstitution" && <Button type="button" variant="ghost" onClick={() => setTarget(randomAddress())}>Generate</Button>}
                {kind !== "AddInstitution" && members.length >= 0 && (
                  <select className="mini-select" value="" onChange={(e) => e.target.value && setTarget(e.target.value)}>
                    <option value="">Pick member…</option>
                    {members.map((m) => <option key={m} value={m}>{labelFor(m)}</option>)}
                  </select>
                )}
              </div>
            </label>
            {needsDid && (
              <div className="grid-2-tight">
                <label className="field"><span>Institution DID</span><input value={did} onChange={(e) => setDid(e.target.value)} placeholder="did:vericred:university-d" /></label>
                <label className="field"><span>Display name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="University D" /></label>
              </div>
            )}
            <Button icon="arrow" type="submit" loading={busy === "propose"} disabled={!valid || !actor}>Submit proposal as {labelFor(actor) || "member"}</Button>
          </form>
        </Card>
      </div>

      <Card title="Proposals" subtitle={`${open.length} open · ${closed.length} executed`} icon="file" className="gap-top">
        {proposals.length === 0 ? (
          <Empty icon="users" title="No proposals yet">Create one above to start a vote.</Empty>
        ) : (
          <div className="proposal-grid">
            {[...open, ...closed].map((p) => <ProposalCard key={p.proposalId} p={p} />)}
          </div>
        )}
      </Card>
    </>
  );
}
