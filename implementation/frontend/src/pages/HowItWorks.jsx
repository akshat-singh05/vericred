import { useApp } from "../context";
import { Button, Card, Icon, PageHeader } from "../ui";

const FLOW = [
  { icon: "building", role: "University", title: "Issue a cohort", text: "Every student record is salted and hashed into a Merkle tree. Only the 32-byte root is anchored on-chain, in one transaction for the whole class.", go: "issuer" },
  { icon: "cap", role: "Student", title: "Choose what to share", text: "The student reveals only the fields an employer needs. Hidden fields stay hidden, only their salted hashes travel with the proof.", go: "holder" },
  { icon: "verify", role: "Employer", title: "Verify in milliseconds", text: "Four checks run against the blockchain: issuer membership, signature, Merkle proof, revocation. No call to the university.", go: "verifier" },
];

const DESIGN = [
  { icon: "layers", title: "Merkle batching", text: "Cost per cohort is flat (about 148K gas) instead of growing linearly with every credential." },
  { icon: "eyeoff", title: "Selective disclosure", text: "Per-field salted leaves allow a student to prove a degree without exposing a GPA." },
  { icon: "ban", title: "Bitmap revocation", text: "256 credentials share one storage word, so revoking is cheap and a status lookup is one read." },
  { icon: "key", title: "Key rotation history", text: "Signatures are checked against the key that was valid at issuance time, so rotating a key does not break old credentials." },
  { icon: "users", title: "Consortium governance", text: "Adding, removing, or re-keying an issuer needs an M-of-N vote, with no single administrator." },
  { icon: "shield", title: "Privacy by design", text: "No personal data is stored on-chain, only commitments. Records stay with the university and the student." },
];

const CHECKS = [
  ["1", "Issuer membership", "IssuerRegistry says the issuer is active."],
  ["2", "Signature", "The batch root is signed by the issuer key valid at that time."],
  ["3", "Merkle proof", "Disclosed fields rebuild the root stored in CredentialAnchor."],
  ["4", "Revocation", "The RevocationRegistry bit for this credential is clear."],
];

export default function HowItWorks() {
  const { go } = useApp();
  return (
    <>
      <PageHeader eyebrow="Architecture" title="How it works">
        A privacy-preserving, Merkle-batched credential system on a permissioned consortium blockchain.
      </PageHeader>

      <div className="flow">
        {FLOW.map((s, i) => (
          <div className="flow-step" key={s.title}>
            <div className="flow-num">{i + 1}</div>
            <div className="flow-icon"><Icon name={s.icon} size={24} /></div>
            <span className="flow-role">{s.role}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <Button variant="ghost" icon="arrow" onClick={() => go(s.go)}>Open {s.role.toLowerCase()} console</Button>
          </div>
        ))}
      </div>

      <div className="grid-main gap-top">
        <Card title="Design decisions" subtitle="What makes it scalable and private" icon="layers">
          <ul className="design-list">
            {DESIGN.map((d) => (
              <li key={d.title}>
                <span className="card-icon"><Icon name={d.icon} size={18} /></span>
                <div><strong>{d.title}</strong><p>{d.text}</p></div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="stack">
          <Card title="The four verification checks" subtitle="Trust comes from the chain" icon="shield">
            <ol className="check-list">
              {CHECKS.map(([n, t, d]) => (
                <li key={n}><span>{n}</span><div><strong>{t}</strong><p>{d}</p></div></li>
              ))}
            </ol>
          </Card>
          <Card title="Measured results" icon="activity">
            <dl className="kv big">
              <div><dt>Batch anchor cost</dt><dd>≈148K gas, flat</dd></div>
              <div><dt>One-per-credential cost</dt><dd>≈126K gas each</dd></div>
              <div><dt>Revocation storage saving</dt><dd>≈32% at 100 credentials</dd></div>
              <div><dt>Verification latency</dt><dd>under 30 ms</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
