const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { ethers } = require("ethers");
const { buildBatch } = require("../../offchain/issuance");
const store = require("../store");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/** Resolves an institution's off-chain signing wallet (demo-only local keystore, see store.js). */
function resolveSigningWallet(deployment, institutionAddress) {
  const demo = Object.values(deployment.demoAccounts).find(
    (a) => a && a.institutionAddress && a.institutionAddress.toLowerCase() === institutionAddress.toLowerCase()
  );
  if (demo) return new ethers.Wallet(demo.signingKeyPrivate);
  const stored = store.getInstitution(institutionAddress);
  if (stored) return new ethers.Wallet(stored.signingKeyPrivate);
  throw new Error(`No local signing wallet known for institution ${institutionAddress}`);
}

function parseCohortCsv(csvText) {
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  if (records.length === 0) throw new Error("CSV has no data rows");
  const firstRow = records[0];
  if (!("subjectId" in firstRow)) {
    throw new Error('CSV must have a "subjectId" column plus one column per credential field');
  }
  return records.map((row) => {
    const { subjectId, ...fields } = row;
    return { subjectId, fields };
  });
}

module.exports = function issuerRoutes(contracts) {
  const router = express.Router();

  router.post("/cohort/parse", upload.single("file"), (req, res) => {
    try {
      const csvText = req.file ? req.file.buffer.toString("utf8") : req.body.csvText;
      if (!csvText) return res.status(400).json({ error: "Provide a CSV file upload or csvText in the body" });
      const cohort = parseCohortCsv(csvText);
      res.json({ cohort, studentCount: cohort.length, fieldNames: Object.keys(cohort[0].fields) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get("/institutions", async (req, res) => {
    try {
      const { deployment, issuerRegistry } = contracts();
      const demoEntries = Object.entries(deployment.demoAccounts)
        .filter(([, v]) => v && v.institutionAddress)
        .map(([name, v]) => [v.institutionAddress, { name, did: v.did }]);
      const storedEntries = Object.entries(store.listInstitutions()).map(([addr, v]) => [
        addr,
        { name: v.name, did: v.did },
      ]);
      const byAddress = new Map([...demoEntries, ...storedEntries]);

      const institutions = [];
      for (const [institutionAddress, meta] of byAddress) {
        const active = await issuerRegistry.isActiveIssuer(institutionAddress);
        institutions.push({ ...meta, institutionAddress, active });
      }
      res.json({ institutions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/batches", async (req, res) => {
    try {
      const { institutionAddress, cohort, metadataURI } = req.body;
      if (!institutionAddress || !Array.isArray(cohort) || cohort.length === 0) {
        return res.status(400).json({ error: "institutionAddress and a non-empty cohort array are required" });
      }
      const { deployment, credentialAnchor, issuerRegistry, as } = contracts();

      const isActive = await issuerRegistry.isActiveIssuer(institutionAddress);
      if (!isActive) return res.status(403).json({ error: `${institutionAddress} is not an active consortium issuer` });

      const signingWallet = resolveSigningWallet(deployment, institutionAddress);
      const did = await issuerRegistry.getDid(institutionAddress);
      const issuanceDate = new Date().toISOString();

      const batchBuild = await buildBatch(cohort, signingWallet, did, issuanceDate);

      const tx = await (await as(credentialAnchor, institutionAddress)).anchorBatch(
        batchBuild.batchRoot,
        cohort.length,
        metadataURI || `demo://cohort-${issuanceDate}`
      );
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((l) => {
          try {
            return credentialAnchor.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "BatchAnchored");
      const batchId = Number(event.args.batchId);

      store.saveBatch(batchId, institutionAddress, metadataURI || null, batchBuild);

      res.status(201).json({
        batchId,
        batchRoot: batchBuild.batchRoot,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        studentCount: cohort.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/batches", (req, res) => {
    res.json({ batches: store.listBatches() });
  });

  router.get("/batches/:batchId", async (req, res) => {
    const batch = store.getBatch(req.params.batchId);
    if (!batch) return res.status(404).json({ error: "Unknown batchId" });
    res.json({
      ...batch,
      students: batch.students.map((s) => ({ subjectId: s.subjectId, fields: s.fields, leafIndexInBatch: s.leafIndexInBatch })),
      batchTreeLayers: undefined,
    });
  });

  // body: { institutionAddress, credentialId, scheme?: "bitmap"|"naive" } — scheme lets
  // Experiment 2's benchmark script exercise either registry through the same endpoint.
  router.post("/revoke", async (req, res) => {
    try {
      const { institutionAddress, credentialId, scheme } = req.body;
      if (!institutionAddress || credentialId === undefined) {
        return res.status(400).json({ error: "institutionAddress and credentialId are required" });
      }
      const { revocationRegistry, naiveRevocationRegistry, as } = contracts();
      const registry = scheme === "naive" ? naiveRevocationRegistry : revocationRegistry;
      const tx = await (await as(registry, institutionAddress)).revoke(credentialId);
      const receipt = await tx.wait();
      res.json({ txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/revocation-status/:credentialId", async (req, res) => {
    try {
      const { revocationRegistry } = contracts();
      const revoked = await revocationRegistry.isRevoked(req.params.credentialId);
      res.json({ credentialId: req.params.credentialId, revoked });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
