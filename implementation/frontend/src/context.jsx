import { createContext, useContext } from "react";

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const PROPOSAL_TYPES = ["Add institution", "Remove institution", "Rotate signing key"];

// Mean gas of one on-chain single-credential issuance, measured over 30 real
// calls (experiments/results/issuance_cost.csv) -- used only for the savings
// comparison shown after a batch is anchored.
export const INDIVIDUAL_GAS_PER_CREDENTIAL = 126273;

export function credentialIdFor(batchId, leafIndex) {
  return ((BigInt(batchId) << 32n) | BigInt(leafIndex)).toString();
}
