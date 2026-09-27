const { ethers } = require("ethers");
const { hashField, wrapAsBatchLeaf, randomSalt, buildMerkleTree, getProof } = require("./merkle");
const { buildCredentialDocument } = require("./credentialDocument");

/**
 * Builds one cohort's Merkle-batched issuance package (contribution C1).
 *
 * @param {Array<{subjectId: string, fields: Record<string,string|number>}>} cohort
 * @param {ethers.Wallet} issuerSigningWallet - signs the batch root (EIP-191 personal_sign)
 * @param {string} issuerDid
 * @param {string} issuanceDate - ISO 8601
 * @returns {{
 *   batchRoot: string,
 *   batchSignature: string,
 *   issuanceDate: string,
 *   batchTreeLayers: string[][],
 *   students: Array<{
 *     subjectId: string,
 *     fields: Record<string,string|number>,
 *     fieldSalts: Record<string,string>,
 *     fieldLeaves: Record<string,string>,
 *     studentRoot: string,
 *     leafIndexInBatch: number,
 *     credentialDocument: object
 *   }>
 * }}
 */
async function buildBatch(cohort, issuerSigningWallet, issuerDid, issuanceDate) {
  if (!cohort || cohort.length === 0) throw new Error("buildBatch: empty cohort");

  const students = cohort.map((student) => {
    const fieldSalts = {};
    const fieldLeaves = {};
    const fieldNames = Object.keys(student.fields);
    for (const fieldName of fieldNames) {
      const salt = randomSalt();
      fieldSalts[fieldName] = salt;
      fieldLeaves[fieldName] = hashField(fieldName, student.fields[fieldName], salt);
    }
    // Field order must be stable for the verifier to rebuild the same tree;
    // sort lexicographically rather than relying on object key insertion order.
    const orderedFieldNames = fieldNames.slice().sort();
    const orderedLeaves = orderedFieldNames.map((f) => fieldLeaves[f]);
    const { root: studentRoot } = buildMerkleTree(orderedLeaves);

    return {
      subjectId: student.subjectId,
      fields: student.fields,
      fieldOrder: orderedFieldNames,
      fieldSalts,
      fieldLeaves,
      studentRoot,
      credentialDocument: buildCredentialDocument({
        issuerDid,
        subjectId: student.subjectId,
        fields: student.fields,
        issuanceDate,
      }),
    };
  });

  const batchLeaves = students.map((s) => wrapAsBatchLeaf(s.studentRoot));
  const { root: batchRoot, layers: batchTreeLayers } = buildMerkleTree(batchLeaves);

  students.forEach((s, i) => {
    s.leafIndexInBatch = i;
  });

  const batchSignature = await issuerSigningWallet.signMessage(ethers.getBytes(batchRoot));

  return {
    batchRoot,
    batchSignature,
    issuanceDate,
    batchTreeLayers,
    students,
  };
}

/** Convenience for the naive single-issuance baseline: hash of the full (undisclosed) credential document. */
function hashSingleCredential(credentialDocument) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(credentialDocument)));
}

module.exports = { buildBatch, hashSingleCredential, getProof };
