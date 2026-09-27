const express = require("express");
const { ethers } = require("ethers");
const store = require("../store");

module.exports = function governanceRoutes(contracts) {
  const router = express.Router();

  router.get("/members", async (req, res) => {
    try {
      const { governance } = contracts();
      const count = await governance.memberCount();
      const threshold = await governance.threshold();
      const members = [];
      for (let i = 0; i < count; i++) {
        members.push(await governance.memberList(i));
      }
      res.json({ members, threshold: Number(threshold) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/proposals/:id", async (req, res) => {
    try {
      const { governance } = contracts();
      const p = await governance.getProposal(req.params.id);
      res.json({
        proposalId: Number(req.params.id),
        proposalType: Number(p.proposalType),
        institution: p.institution,
        did: p.did,
        signingKey: p.signingKey,
        votesFor: Number(p.votesFor),
        executed: p.executed,
        createdAt: Number(p.createdAt),
      });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.get("/proposals", async (req, res) => {
    try {
      const { governance } = contracts();
      const count = Number(await governance.proposalCount());
      const proposals = [];
      for (let i = 0; i < count; i++) {
        const p = await governance.getProposal(i);
        proposals.push({
          proposalId: i,
          proposalType: Number(p.proposalType),
          institution: p.institution,
          did: p.did,
          signingKey: p.signingKey,
          votesFor: Number(p.votesFor),
          executed: p.executed,
          createdAt: Number(p.createdAt),
        });
      }
      res.json({ proposals });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // body: { proposerAddress, type: "AddInstitution"|"RemoveInstitution"|"RotateKey",
  //         institutionAddress, did?, institutionName? }
  router.post("/proposals", async (req, res) => {
    try {
      const { proposerAddress, type, institutionAddress, did, institutionName } = req.body;
      if (!proposerAddress || !type || !institutionAddress) {
        return res.status(400).json({ error: "proposerAddress, type, and institutionAddress are required" });
      }
      const { governance, as } = contracts();
      const g = await as(governance, proposerAddress);

      let tx;
      let generatedSigningKey = null;
      if (type === "AddInstitution") {
        if (!did) return res.status(400).json({ error: "did is required for AddInstitution" });
        const signingWallet = ethers.Wallet.createRandom();
        generatedSigningKey = signingWallet.address;
        store.saveInstitution(institutionAddress, {
          name: institutionName || did,
          did,
          signingKeyAddress: signingWallet.address,
          signingKeyPrivate: signingWallet.privateKey,
        });
        tx = await g.proposeAddInstitution(institutionAddress, did, signingWallet.address);
      } else if (type === "RemoveInstitution") {
        tx = await g.proposeRemoveInstitution(institutionAddress);
      } else if (type === "RotateKey") {
        const signingWallet = ethers.Wallet.createRandom();
        generatedSigningKey = signingWallet.address;
        const existing = store.getInstitution(institutionAddress) || {};
        store.saveInstitution(institutionAddress, {
          ...existing,
          signingKeyAddress: signingWallet.address,
          signingKeyPrivate: signingWallet.privateKey,
        });
        tx = await g.proposeRotateKey(institutionAddress, signingWallet.address);
      } else {
        return res.status(400).json({ error: `Unknown proposal type "${type}"` });
      }

      const receipt = await tx.wait();
      const event = receipt.logs
        .map((l) => {
          try {
            return governance.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "ProposalCreated");

      res.status(201).json({
        proposalId: Number(event.args.proposalId),
        txHash: receipt.hash,
        generatedSigningKey,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/proposals/:id/vote", async (req, res) => {
    try {
      const { voterAddress } = req.body;
      if (!voterAddress) return res.status(400).json({ error: "voterAddress is required" });
      const { governance, as } = contracts();
      const tx = await (await as(governance, voterAddress)).vote(req.params.id);
      const receipt = await tx.wait();
      const p = await governance.getProposal(req.params.id);
      res.json({ txHash: receipt.hash, executed: p.executed, votesFor: Number(p.votesFor) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
