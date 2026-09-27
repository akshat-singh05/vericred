const path = require("path");
const fs = require("fs");

const RPC_URL = process.env.VERICRED_RPC_URL || "http://127.0.0.1:8545";
const PORT = process.env.VERICRED_PORT || 4000;
const DEPLOYMENT_PATH = path.join(__dirname, "deployment.json");
const STORE_PATH = path.join(__dirname, "data", "store.json");

function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error(
      `No deployment.json found at ${DEPLOYMENT_PATH}. Run "npm run node" then "npm run deploy" first (see README).`
    );
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
}

module.exports = { RPC_URL, PORT, DEPLOYMENT_PATH, STORE_PATH, loadDeployment };
