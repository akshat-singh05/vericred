const express = require("express");
const { verifyPresentation } = require("../../offchain/verifier");

module.exports = function verifierRoutes(contracts) {
  const router = express.Router();

  router.post("/verify", async (req, res) => {
    try {
      const presentation = req.body.presentation || req.body;
      if (!presentation || presentation.batchId === undefined) {
        return res.status(400).json({ error: "A presentation object (with at least batchId) is required" });
      }
      const { issuerRegistry, credentialAnchor, revocationRegistry } = contracts();
      const result = await verifyPresentation(presentation, { issuerRegistry, credentialAnchor, revocationRegistry });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
