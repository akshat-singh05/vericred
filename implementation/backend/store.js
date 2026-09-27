const fs = require("fs");
const path = require("path");
const { STORE_PATH } = require("./config");

/**
 * Minimal JSON-file store standing in for each holder's own wallet/app in
 * this demo. In a real deployment, `students[i].fieldSalts` (the data
 * needed to prove a credential) would be handed directly to that student's
 * own device at issuance time and never retained centrally — keeping it
 * here is a deliberate prototype simplification so the React demo can show
 * the issuer/holder/verifier flow end-to-end without building a wallet app.
 * See README "Scope & Simplifications".
 */
function load() {
  if (!fs.existsSync(STORE_PATH)) {
    return { batches: {}, institutions: {} };
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function save(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function saveBatch(batchId, institutionAddress, metadataURI, batchBuild) {
  const data = load();
  data.batches[String(batchId)] = {
    institutionAddress,
    metadataURI,
    batchRoot: batchBuild.batchRoot,
    batchSignature: batchBuild.batchSignature,
    issuanceDate: batchBuild.issuanceDate,
    batchTreeLayers: batchBuild.batchTreeLayers,
    students: batchBuild.students,
  };
  save(data);
}

function getBatch(batchId) {
  const data = load();
  return data.batches[String(batchId)];
}

function listBatches() {
  const data = load();
  return Object.entries(data.batches).map(([batchId, b]) => ({
    batchId: Number(batchId),
    institutionAddress: b.institutionAddress,
    metadataURI: b.metadataURI,
    issuanceDate: b.issuanceDate,
    studentCount: b.students.length,
  }));
}

/** Finds every (batchId, studentIndex) pair for a given subjectId across all batches. */
function findCredentialsForSubject(subjectId) {
  const data = load();
  const results = [];
  for (const [batchId, batch] of Object.entries(data.batches)) {
    batch.students.forEach((s, index) => {
      if (s.subjectId === subjectId) {
        results.push({ batchId: Number(batchId), studentIndex: index, fields: s.fields, credentialDocument: s.credentialDocument });
      }
    });
  }
  return results;
}

function saveInstitution(institutionAddress, record) {
  const data = load();
  data.institutions[institutionAddress] = record;
  save(data);
}

function getInstitution(institutionAddress) {
  const data = load();
  return data.institutions[institutionAddress];
}

function listInstitutions() {
  const data = load();
  return data.institutions;
}

module.exports = {
  saveBatch,
  getBatch,
  listBatches,
  findCredentialsForSubject,
  saveInstitution,
  getInstitution,
  listInstitutions,
};
