const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("../../test/helpers/deploy");
const { writeCsv, GAS_PRICE_GWEI, ETH_USD_PRICE, ASSUMPTIONS_DATE, gasToUsd } = require("./_lib");

// (M, N) settings to benchmark: threshold-of-totalMembers
const SETTINGS = [
  { m: 1, n: 1 },
  { m: 2, n: 3 },
  { m: 3, n: 5 },
  { m: 5, n: 9 },
];

async function main() {
  const allSigners = await ethers.getSigners();
  const rows = [];

  for (const { m, n } of SETTINGS) {
    const members = allSigners.slice(1, 1 + n); // skip signer 0 (used as tx sender elsewhere)
    const newInstitution = allSigners[1 + n]; // first signer after the member set
    const signingWallet = ethers.Wallet.createRandom();

    const { governance } = await deploySuite(
      members.map((s) => s.address),
      m
    );

    let totalGas = 0n;
    let txCount = 0;

    const proposeTx = await governance
      .connect(members[0])
      .proposeAddInstitution(newInstitution.address, "did:vericred:bench-onboard", signingWallet.address);
    const proposeReceipt = await proposeTx.wait();
    totalGas += proposeReceipt.gasUsed;
    txCount += 1;

    const created = proposeReceipt.logs
      .map((l) => { try { return governance.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "ProposalCreated");
    const proposalId = created.args.proposalId;

    let voterIndex = 1;
    let proposal = await governance.getProposal(proposalId);
    while (!proposal.executed) {
      const voteTx = await governance.connect(members[voterIndex]).vote(proposalId);
      const voteReceipt = await voteTx.wait();
      totalGas += voteReceipt.gasUsed;
      txCount += 1;
      voterIndex += 1;
      proposal = await governance.getProposal(proposalId);
    }

    rows.push({
      threshold_M: m,
      totalMembers_N: n,
      transactionsNeeded: txCount,
      totalGasUsed: totalGas.toString(),
      avgGasPerTransaction: (Number(totalGas) / txCount).toFixed(1),
      totalGasUsd: gasToUsd(totalGas).toFixed(4),
      gasPriceGwei: GAS_PRICE_GWEI,
      ethUsdPrice: ETH_USD_PRICE,
      assumptionsDate: ASSUMPTIONS_DATE,
    });
    console.log(`M=${m} N=${n}: ${txCount} txs, ${totalGas} gas total`);
  }

  writeCsv("governance_cost.csv", rows);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
