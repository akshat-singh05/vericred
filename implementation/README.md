# VeriCred — implementation

Contracts, off-chain services, backend API, and a demo React frontend for
the architecture described in [PLAN.md](../PLAN.md).

## One-command setup

```bash
npm install
```

Runs at the repo's `implementation/` directory. This installs everything —
Hardhat/Solidity toolchain, backend (Express), and you'll separately
`npm install` inside `frontend/` the first time (see below), since it's a
second package with its own Vite toolchain.

```bash
npm install --prefix frontend
```

## Running the full stack (4 terminals)

The system needs a local blockchain, a deployment against it, the backend
API, and the frontend dev server, in that order.

**Terminal 1 — local permissioned-consortium network (Hardhat node):**
```bash
npm run node
```
Leave this running. It prints 20 funded test accounts — these are
Hardhat's publicly-known devnet accounts, safe only on this local network.

**Terminal 2 — deploy contracts + seed a demo consortium:**
```bash
npm run deploy
```
Deploys `IssuerRegistry`, `ConsortiumGovernance`, `CredentialAnchor`,
`RevocationRegistry`, and `NaiveRevocationRegistry`, then onboards two demo
universities via a 2-of-3 governance vote (accreditation body + the two
universities). Writes `backend/deployment.json` (gitignored — regenerate
any time by re-running this command against a fresh node).

**Terminal 3 — backend API:**
```bash
npm run backend
```
Listens on `http://127.0.0.1:4000`. Check `GET /health`.

**Terminal 4 — frontend:**
```bash
cd frontend && npm run dev
```
Opens on `http://127.0.0.1:5173`. Covers all four roles as tabs: Issuer,
Holder, Verifier, Governance.

## Running tests

```bash
npm test
```
Runs the full Hardhat test suite (Mocha/Chai): every contract's public
functions plus negative cases (unauthorized caller, unknown batch, wrong
revoker, double-vote, non-member vote, removed issuer, tampered field,
tampered salt, forged Merkle proof, wrong-key signature, revoked
credential). Also prints a gas report per function.

## Layout

```
contracts/            Solidity: ConsortiumGovernance, IssuerRegistry, CredentialAnchor,
                       RevocationRegistry (bitmap) + NaiveRevocationRegistry (baseline),
                       lib/CredentialId.sol, interfaces/
offchain/              merkle.js, issuance.js, disclosure.js, verifier.js — the
                       credential-building and 4-step verification library, used by
                       both the backend and the Hardhat tests directly
backend/               Express REST API: issuer/holder/verifier/governance routes
frontend/              React (Vite) demo UI, one tab per role
scripts/deploy.js      Deploys + seeds the demo consortium
test/                  Hardhat test suite (contracts + end-to-end off-chain/on-chain)
```

## Identity model (read this before extending the backend)

Each institution has **two separate keys**, deliberately decoupled (see
`offchain/verifier.js` and PLAN.md contribution C3):

- an **on-chain account** — used to call `anchorBatch`/`vote`/`revoke`
  (governed by `IssuerRegistry.isActiveIssuer`, keyed by this address);
- an **off-chain signing key** — used only to `Wallet.signMessage()` over a
  batch root (governed by `IssuerRegistry.signingKeyAt(institution, timestamp)`,
  which can rotate independently via a governance vote without touching the
  on-chain account or invalidating past signatures).

The demo backend holds institutions' off-chain signing-key private keys
locally in `backend/deployment.json` / `backend/data/store.json` (both
gitignored, regenerated per run) purely to simulate an issuer signing a
credential in one process. **This is a prototype simplification, not a
production design** — a real deployment keeps that key in an HSM or the
institution's own signing service and never sends it to a shared backend.

## Scope & simplifications (for the paper's Implementation/Limitations sections)

- `backend/store.js` retains each student's field salts centrally so the
  demo can show the full issuer→holder→verifier flow without building a
  wallet app. In a real deployment this data goes directly to the holder's
  own device at issuance time and is never retained centrally.
- The Hardhat network used for `npm run node` is a single-node devnet — it
  models the *authorization* layer of a permissioned consortium (who may
  call what, gated by `IssuerRegistry`/`ConsortiumGovernance`), not real
  multi-validator PoA/QBFT consensus. See PLAN.md §3.
- Selective disclosure here is salted-hash based, not zero-knowledge — see
  PLAN.md contribution C1 and the paper's Security & Privacy Analysis for
  the resulting linkability limitation.
