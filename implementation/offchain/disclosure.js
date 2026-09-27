const { getProof, wrapAsBatchLeaf } = require("./merkle");
const { CredentialId } = require("./credentialId");

/**
 * Builds a selective-disclosure presentation for one student out of an
 * already-anchored batch (contribution C1). The holder chooses which fields
 * to reveal; undisclosed fields are represented only by their opaque leaf
 * hash, so the verifier can still recompute the student root without
 * learning the value or the salt.
 *
 * @param {object} batchBuild - result of issuance.buildBatch(...)
 * @param {number} studentIndex - index into batchBuild.students
 * @param {string[]} disclosedFieldNames
 * @param {number} batchId - on-chain batch id, known only after anchorBatch() is mined
 */
function buildSelectiveDisclosure(batchBuild, studentIndex, disclosedFieldNames, batchId) {
  const student = batchBuild.students[studentIndex];
  if (!student) throw new Error("buildSelectiveDisclosure: unknown student index");
  const disclosedSet = new Set(disclosedFieldNames);

  const disclosedFields = {};
  const undisclosedFieldHashes = {};
  for (const fieldName of student.fieldOrder) {
    if (disclosedSet.has(fieldName)) {
      disclosedFields[fieldName] = {
        value: student.fields[fieldName],
        salt: student.fieldSalts[fieldName],
      };
    } else {
      undisclosedFieldHashes[fieldName] = student.fieldLeaves[fieldName];
    }
  }

  const batchLeafProof = getProof(batchBuild.batchTreeLayers, student.leafIndexInBatch);
  const credentialId = CredentialId.encodeBatchCredential(batchId, student.leafIndexInBatch);

  return {
    subjectId: student.subjectId,
    fieldOrder: student.fieldOrder,
    disclosedFields,
    undisclosedFieldHashes,
    studentRoot: student.studentRoot,
    batchLeafProof,
    batchId,
    leafIndexInBatch: student.leafIndexInBatch,
    credentialId: credentialId.toString(),
    batchRoot: batchBuild.batchRoot,
    batchSignature: batchBuild.batchSignature,
    issuanceDate: batchBuild.issuanceDate,
    credentialDocumentTemplate: student.credentialDocument, // for display only, not trusted by the verifier
  };
}

module.exports = { buildSelectiveDisclosure };
