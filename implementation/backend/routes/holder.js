const express = require("express");
const QRCode = require("qrcode");
const { buildSelectiveDisclosure } = require("../../offchain/disclosure");
const store = require("../store");

module.exports = function holderRoutes() {
  const router = express.Router();

  router.get("/:subjectId/credentials", (req, res) => {
    const credentials = store.findCredentialsForSubject(req.params.subjectId);
    res.json({ credentials });
  });

  router.post("/disclosures", async (req, res) => {
    try {
      const { batchId, studentIndex, disclosedFields } = req.body;
      if (batchId === undefined || studentIndex === undefined || !Array.isArray(disclosedFields)) {
        return res.status(400).json({ error: "batchId, studentIndex, and disclosedFields[] are required" });
      }
      const batchBuild = store.getBatch(batchId);
      if (!batchBuild) return res.status(404).json({ error: "Unknown batchId" });

      const presentation = buildSelectiveDisclosure(batchBuild, studentIndex, disclosedFields, Number(batchId));
      // QR payload carries only what verifyPresentation() actually needs (contribution "f":
      // QR-based offline-first verification) — the display-only VC template is dropped to
      // keep the encoded data well under QR capacity, especially as cohort size (and so
      // batchLeafProof length, O(log n)) grows.
      const { credentialDocumentTemplate, ...verifiablePresentation } = presentation;
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(verifiablePresentation), { errorCorrectionLevel: "L" });

      res.json({ presentation, qrPayloadBytes: Buffer.byteLength(JSON.stringify(verifiablePresentation)), qrDataUrl });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
