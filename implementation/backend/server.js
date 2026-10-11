const express = require("express");
const cors = require("cors");
const { PORT } = require("./config");
const { connect } = require("./contracts");

const issuerRoutes = require("./routes/issuer");
const holderRoutes = require("./routes/holder");
const verifierRoutes = require("./routes/verifier");
const governanceRoutes = require("./routes/governance");
const statsRoutes = require("./routes/stats");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Lazily (re-)connect on each request that needs it, rather than once at
// startup, so the backend gives a clear error instead of crashing if it's
// started before `npm run deploy` has written deployment.json.
function contracts() {
  return connect();
}

app.get("/health", (req, res) => {
  try {
    const c = contracts();
    res.json({ ok: true, network: c.deployment.network, deployedAt: c.deployment.deployedAt, contracts: c.deployment.contracts });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use("/issuer", issuerRoutes(contracts));
app.use("/holder", holderRoutes());
app.use("/verifier", verifierRoutes(contracts));
app.use("/governance", governanceRoutes(contracts));
app.use("/stats", statsRoutes(contracts));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`VeriCred backend listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
