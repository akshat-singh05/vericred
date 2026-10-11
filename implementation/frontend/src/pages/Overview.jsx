import { useApp, PROPOSAL_TYPES } from "../context";
import { Badge, Button, Card, Empty, Hash, Icon, StatCard, fmtCompact, fmtNum, shortHash, timeAgo } from "../ui";

// Measured results (experiments/results/issuance_cost.csv): on-chain gas to
// issue a cohort of the given size, anchored as one batch vs. one credential
// per transaction (mean per-call gas x cohort size).
const SIZES = [1, 10, 100, 500, 1000, 5000];
const BATCH_GAS = [165314, 148214, 148214, 148226, 148226, 148226];
const INDIVIDUAL_GAS = [126273, 1262732, 12627320, 63136600, 126273200, 631366000];

function GasChart() {
  const W = 620, H = 330, x0 = 70, x1 = 590, y0 = 20, y1 = 268;
  const lx = (n) => x0 + (Math.log10(n) / Math.log10(5000)) * (x1 - x0);
  const ly = (v) => y1 - ((Math.log10(v) - 5) / 4) * (y1 - y0);
  const pts = (arr) => arr.map((v, i) => `${lx(SIZES[i])},${ly(v)}`).join(" ");
  const yTicks = [[1e5, "100K"], [1e6, "1M"], [1e7, "10M"], [1e8, "100M"], [1e9, "1B"]];
  const ratio = INDIVIDUAL_GAS[5] / BATCH_GAS[5];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gas used to issue a cohort, batch versus individual issuance">
        {yTicks.map(([v, label]) => (
          <g key={v}>
            <line x1={x0} x2={x1} y1={ly(v)} y2={ly(v)} className="grid-line" />
            <text x={x0 - 10} y={ly(v) + 4} textAnchor="end" className="axis-label">{label}</text>
          </g>
        ))}
        {SIZES.map((n) => (
          <g key={n}>
            <line x1={lx(n)} x2={lx(n)} y1={y1} y2={y1 + 5} className="axis-line" />
            <text x={lx(n)} y={y1 + 20} textAnchor="middle" className="axis-label">{fmtNum(n)}</text>
          </g>
        ))}
        <line x1={x0} x2={x1} y1={y1} y2={y1} className="axis-line" />
        <text x={(x0 + x1) / 2} y={H - 22} textAnchor="middle" className="axis-title">Credentials issued in one cohort (log scale)</text>
        <text transform={`translate(16 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">On-chain gas (log scale)</text>

        <polyline points={pts(INDIVIDUAL_GAS)} className="line-individual" />
        <polyline points={pts(BATCH_GAS)} className="line-batch" />
        {SIZES.map((n, i) => (
          <g key={n}>
            <rect x={lx(n) - 4} y={ly(INDIVIDUAL_GAS[i]) - 4} width="8" height="8" className="pt-individual" />
            <circle cx={lx(n)} cy={ly(BATCH_GAS[i])} r="5" className="pt-batch" />
          </g>
        ))}
        <text x={lx(5000) - 8} y={ly(INDIVIDUAL_GAS[5]) - 10} textAnchor="end" className="end-label dark">631M gas</text>
        <text x={lx(5000) - 8} y={ly(BATCH_GAS[5]) - 12} textAnchor="end" className="end-label accent">148K gas</text>
      </svg>
      <div className="chart-legend">
        <span><i className="swatch swatch-batch" /> Merkle-batched issuance (one transaction)</span>
        <span><i className="swatch swatch-ind" /> One transaction per credential</span>
      </div>
      <p className="chart-note">
        At 5,000 credentials, batching is <strong>{fmtNum(Math.round(ratio))}x</strong> cheaper in gas, and its cost stays flat as the cohort grows.
        Measured on our deployed contracts.
      </p>
    </div>
  );
}

function describe(a, labelFor) {
  switch (a.type) {
    case "batch_anchored":
      return { icon: "layers", tone: "blue", title: `Batch #${a.batchId} anchored`, detail: `${fmtNum(a.credentials)} credentials by ${labelFor(a.issuer)}${a.gasUsed ? ` · ${fmtNum(a.gasUsed)} gas` : ""}` };
    case "credential_revoked":
      return { icon: "ban", tone: "red", title: "Credential revoked", detail: `Issued by ${labelFor(a.issuer)} · id ${shortHash(a.credentialId, 6, 4)}` };
    case "proposal_created":
      return { icon: "users", tone: "amber", title: `Proposal #${a.proposalId} created`, detail: `${PROPOSAL_TYPES[a.proposalType]} · ${labelFor(a.institution)}` };
    case "proposal_executed":
      return { icon: "check", tone: "green", title: `Proposal #${a.proposalId} executed`, detail: `${PROPOSAL_TYPES[a.proposalType]} · ${labelFor(a.institution)}` };
    default:
      return { icon: "activity", tone: "blue", title: a.type, detail: "" };
  }
}

export default function Overview() {
  const { stats, go, labelFor } = useApp();

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow light">Permissioned consortium blockchain</div>
          <h1>Academic credentials you can verify in milliseconds, without calling the university.</h1>
          <p>
            A whole graduating class is anchored in a single transaction. Students share only the fields an employer needs, and every check
            is verified against the chain, not against anyone's word.
          </p>
          <div className="hero-actions">
            <Button icon="building" onClick={() => go("issuer")}>Issue a cohort</Button>
            <Button variant="light" icon="verify" onClick={() => go("verifier")}>Verify a credential</Button>
          </div>
        </div>
        <ul className="hero-points">
          <li><Icon name="layers" size={18} /><span><strong>Batch anchoring</strong> constant on-chain cost per cohort</span></li>
          <li><Icon name="eyeoff" size={18} /><span><strong>Selective disclosure</strong> hide GPA, reveal degree</span></li>
          <li><Icon name="ban" size={18} /><span><strong>Cheap revocation</strong> 256 credentials per storage word</span></li>
          <li><Icon name="users" size={18} /><span><strong>Consortium governance</strong> M-of-N votes admit issuers</span></li>
        </ul>
      </section>

      <div className="grid-4 gap-top">
        <StatCard icon="layers" tone="blue" label="Credentials anchored" value={stats ? fmtNum(stats.credentialsAnchored) : "-"} hint={stats ? `in ${stats.batchCount} batch${stats.batchCount === 1 ? "" : "es"}` : ""} />
        <StatCard icon="users" tone="teal" label="Consortium approval rule" value={stats ? `${stats.threshold} of ${stats.memberCount}` : "-"} hint="members must approve changes" />
        <StatCard icon="ban" tone="red" label="Credentials revoked" value={stats ? fmtNum(stats.revocations) : "-"} hint="recorded on-chain" />
        <StatCard icon="clock" tone="violet" label="Latest block" value={stats ? `#${fmtNum(stats.blockNumber)}` : "-"} hint={stats ? `chain id ${stats.network.chainId}` : ""} />
      </div>

      <div className="grid-main gap-top">
        <Card title="Why batching matters" subtitle="Gas to issue one cohort, measured" icon="activity">
          <GasChart />
        </Card>

        <Card title="Smart contracts" subtitle="Deployed on the local consortium network" icon="file" pad={false}>
          <ul className="contract-list">
            {stats &&
              Object.entries(stats.contracts)
                .filter(([name]) => name !== "NaiveRevocationRegistry")
                .map(([name, addr]) => (
                  <li key={name}>
                    <div>
                      <strong>{name}</strong>
                      <span>
                        {{
                          IssuerRegistry: "Issuer DIDs and key history",
                          ConsortiumGovernance: "M-of-N membership votes",
                          CredentialAnchor: "Batch Merkle roots",
                          RevocationRegistry: "Bitmap revocation status",
                        }[name]}
                      </span>
                    </div>
                    <Hash value={addr} head={8} tail={6} label="Address" />
                  </li>
                ))}
          </ul>
        </Card>
      </div>

      <Card title="Recent on-chain activity" subtitle="Read directly from contract events" icon="activity" className="gap-top" pad={false}
        actions={stats && <Badge tone="green" icon="check">Live</Badge>}>
        {!stats || stats.activity.length === 0 ? (
          <Empty icon="activity" title="No activity yet">Issue a cohort to see it appear here.</Empty>
        ) : (
          <ul className="activity">
            {stats.activity.map((a, i) => {
              const d = describe(a, labelFor);
              return (
                <li key={`${a.txHash}-${i}`}>
                  <span className={`act-icon tone-${d.tone}`}><Icon name={d.icon} size={16} /></span>
                  <div className="act-main">
                    <strong>{d.title}</strong>
                    <span>{d.detail}</span>
                  </div>
                  <div className="act-meta">
                    <span>{timeAgo(a.timestamp)}</span>
                    <Hash value={a.txHash} head={8} tail={4} label="Transaction hash" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
