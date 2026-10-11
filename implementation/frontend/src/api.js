const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.error || `Request to ${path} failed with ${res.status}`);
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  stats: () => request("/stats"),

  listInstitutions: () => request("/issuer/institutions"),
  parseCohortCsv: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/issuer/cohort/parse", { method: "POST", body: form });
  },
  issueBatch: (institutionAddress, cohort, metadataURI) =>
    request("/issuer/batches", { method: "POST", body: JSON.stringify({ institutionAddress, cohort, metadataURI }) }),
  listBatches: () => request("/issuer/batches"),
  getBatch: (batchId) => request(`/issuer/batches/${batchId}`),
  revoke: (institutionAddress, credentialId, scheme) =>
    request("/issuer/revoke", { method: "POST", body: JSON.stringify({ institutionAddress, credentialId, scheme }) }),
  revocationStatus: (credentialId) => request(`/issuer/revocation-status/${credentialId}`),

  holderCredentials: (subjectId) => request(`/holder/${encodeURIComponent(subjectId)}/credentials`),
  buildDisclosure: (batchId, studentIndex, disclosedFields) =>
    request("/holder/disclosures", { method: "POST", body: JSON.stringify({ batchId, studentIndex, disclosedFields }) }),

  verifyPresentation: (presentation) => request("/verifier/verify", { method: "POST", body: JSON.stringify({ presentation }) }),

  governanceMembers: () => request("/governance/members"),
  governanceProposals: () => request("/governance/proposals"),
  proposeGovernance: (payload) => request("/governance/proposals", { method: "POST", body: JSON.stringify(payload) }),
  voteGovernance: (proposalId, voterAddress) =>
    request(`/governance/proposals/${proposalId}/vote`, { method: "POST", body: JSON.stringify({ voterAddress }) }),
};

export const PROPOSAL_TYPE_NAMES = ["AddInstitution", "RemoveInstitution", "RotateKey"];
