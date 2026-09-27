const VERICRED_CONTEXT = "https://vericred.example/context/v1";

/**
 * A W3C-VC-Data-Model-shaped JSON document (context/type/issuer/credentialSubject
 * shape) for an academic credential. This is the human/machine-readable
 * document a holder stores; it is NOT what gets hashed into Merkle leaves
 * field-by-field — that happens from the raw `fields` map in issuance.js, so
 * the two representations must be built from the same `fields` object.
 */
function buildCredentialDocument({ issuerDid, subjectId, fields, issuanceDate, credentialSchema }) {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1", VERICRED_CONTEXT],
    type: ["VerifiableCredential", "AcademicCredential"],
    issuer: issuerDid,
    issuanceDate,
    credentialSchema: credentialSchema || {
      id: `${VERICRED_CONTEXT}/schemas/academic-credential-v1`,
      type: "JsonSchema",
    },
    credentialSubject: {
      id: subjectId,
      ...fields,
    },
  };
}

module.exports = { buildCredentialDocument, VERICRED_CONTEXT };
