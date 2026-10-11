const express = require("express");
const store = require("../store");

/**
 * Read-only chain statistics for the dashboard: counters, member labels, and
 * a recent-activity feed built from the contracts' own events (so the UI
 * shows what is actually on-chain, not what the backend remembers).
 */
module.exports = function statsRoutes(contracts) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const c = contracts();
      const { provider, deployment } = c;

      const [network, blockNumber, batchCount, memberCount, threshold, proposalCount] = await Promise.all([
        provider.getNetwork(),
        provider.getBlockNumber(),
        c.credentialAnchor.batchCount(),
        c.governance.memberCount(),
        c.governance.threshold(),
        c.governance.proposalCount(),
      ]);

      const [anchored, revoked, created, executed] = await Promise.all([
        c.credentialAnchor.queryFilter(c.credentialAnchor.filters.BatchAnchored(), 0),
        c.revocationRegistry.queryFilter(c.revocationRegistry.filters.CredentialRevoked(), 0),
        c.governance.queryFilter(c.governance.filters.ProposalCreated(), 0),
        c.governance.queryFilter(c.governance.filters.ProposalExecuted(), 0),
      ]);

      const credentialsAnchored = anchored.reduce((sum, e) => sum + Number(e.args.credentialCount), 0);

      const labels = {};
      const demo = deployment.demoAccounts || {};
      if (demo.accreditationBody) labels[demo.accreditationBody.toLowerCase()] = "Accreditation Body";
      if (demo.universityA) labels[demo.universityA.institutionAddress.toLowerCase()] = "University A";
      if (demo.universityB) labels[demo.universityB.institutionAddress.toLowerCase()] = "University B";
      for (const [addr, rec] of Object.entries(store.listInstitutions())) {
        labels[addr.toLowerCase()] = rec.name || rec.did;
      }

      const members = [];
      for (let i = 0; i < Number(memberCount); i++) members.push(await c.governance.memberList(i));

      const events = [
        ...anchored.map((e) => ({
          type: "batch_anchored",
          e,
          summary: { batchId: Number(e.args.batchId), issuer: e.args.issuer, credentials: Number(e.args.credentialCount) },
        })),
        ...revoked.map((e) => ({
          type: "credential_revoked",
          e,
          summary: { credentialId: e.args.credentialId.toString(), issuer: e.args.issuer },
        })),
        ...created.map((e) => ({
          type: "proposal_created",
          e,
          summary: { proposalId: Number(e.args.proposalId), proposalType: Number(e.args.proposalType), institution: e.args.institution },
        })),
        ...executed.map((e) => ({
          type: "proposal_executed",
          e,
          summary: { proposalId: Number(e.args.proposalId), proposalType: Number(e.args.proposalType), institution: e.args.institution },
        })),
      ]
        .sort((a, b) => b.e.blockNumber - a.e.blockNumber || b.e.index - a.e.index)
        .slice(0, 12);

      const blockCache = {};
      const activity = [];
      for (const { type, e, summary } of events) {
        if (!(e.blockNumber in blockCache)) blockCache[e.blockNumber] = await provider.getBlock(e.blockNumber);
        const item = { type, blockNumber: e.blockNumber, txHash: e.transactionHash, timestamp: blockCache[e.blockNumber].timestamp, ...summary };
        if (type === "batch_anchored") {
          const receipt = await provider.getTransactionReceipt(e.transactionHash);
          item.gasUsed = Number(receipt.gasUsed);
        }
        activity.push(item);
      }

      res.json({
        network: { name: deployment.network, chainId: Number(network.chainId) },
        blockNumber,
        batchCount: Number(batchCount),
        credentialsAnchored,
        revocations: revoked.length,
        memberCount: Number(memberCount),
        threshold: Number(threshold),
        proposalCount: Number(proposalCount),
        members,
        labels,
        contracts: deployment.contracts,
        activity,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
