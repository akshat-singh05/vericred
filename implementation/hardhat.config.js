require("@nomicfoundation/hardhat-toolbox");

/**
 * The "permissionedConsortium" network name is just the built-in Hardhat
 * in-process network. Authorization (who may write what) is modeled at the contract layer here rather than via a real
 * multi-validator PoA/QBFT network.
 */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // gasPrice left "auto" so gas *usage* (not derived cost) is what
      // experiments/scripts read directly from tx receipts.
    },
    publicTestnet: {
      url: process.env.PUBLIC_TESTNET_RPC_URL || "",
      accounts: process.env.PUBLIC_TESTNET_PRIVATE_KEY
        ? [process.env.PUBLIC_TESTNET_PRIVATE_KEY]
        : [],
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    outputFile: undefined,
    noColors: true,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
