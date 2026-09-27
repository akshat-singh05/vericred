const merkle = require("./merkle");
const { buildCredentialDocument } = require("./credentialDocument");
const { buildBatch, hashSingleCredential } = require("./issuance");
const { buildSelectiveDisclosure } = require("./disclosure");
const { verifyPresentation } = require("./verifier");
const { CredentialId } = require("./credentialId");

module.exports = {
  ...merkle,
  buildCredentialDocument,
  buildBatch,
  hashSingleCredential,
  buildSelectiveDisclosure,
  verifyPresentation,
  CredentialId,
};
