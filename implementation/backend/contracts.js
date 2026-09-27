const path = require("path");
const { ethers } = require("ethers");
const { RPC_URL, loadDeployment } = require("./config");

function artifactAbi(contractName) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
  return require(artifactPath).abi;
}

/**
 * Wires up ethers contract instances against the locally running Hardhat
 * node. Institution/governance-member accounts are addressed by their
 * Hardhat test address and driven via provider.getSigner(address) — Hardhat
 * Network treats its well-known test accounts as unlocked, so the backend
 * never needs their private keys for on-chain calls. The ONE key the backend
 * does hold locally is each institution's off-chain VC-signing wallet
 * (see deploy.js) purely to call Wallet.signMessage() over a batch root —
 * that never touches the chain and is not the same key as the tx-sending
 * account (see offchain/verifier.js for why those are deliberately decoupled).
 */
function connect() {
  const deployment = loadDeployment();
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const addresses = deployment.contracts;
  const issuerRegistry = new ethers.Contract(addresses.IssuerRegistry, artifactAbi("IssuerRegistry"), provider);
  const governance = new ethers.Contract(addresses.ConsortiumGovernance, artifactAbi("ConsortiumGovernance"), provider);
  const credentialAnchor = new ethers.Contract(addresses.CredentialAnchor, artifactAbi("CredentialAnchor"), provider);
  const revocationRegistry = new ethers.Contract(addresses.RevocationRegistry, artifactAbi("RevocationRegistry"), provider);
  const naiveRevocationRegistry = new ethers.Contract(
    addresses.NaiveRevocationRegistry,
    artifactAbi("NaiveRevocationRegistry"),
    provider
  );

  function signerFor(address) {
    return provider.getSigner(address); // async (JsonRpcSigner) — always await this
  }

  return {
    deployment,
    provider,
    issuerRegistry,
    governance,
    credentialAnchor,
    revocationRegistry,
    naiveRevocationRegistry,
    signerFor,
    async as(contract, address) {
      const signer = await signerFor(address);
      return contract.connect(signer);
    },
  };
}

module.exports = { connect };
