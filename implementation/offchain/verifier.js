const { ethers } = require("ethers");
const { buildMerkleTree, hashField, wrapAsBatchLeaf, verifyProof } = require("./merkle");

/**
 * Verifier library (used by the employer/verifier role). Runs, in order:
 *   1. issuer membership   — IssuerRegistry.isActiveIssuer
 *   2. signature           — ECDSA recovery vs. the key valid at batch anchor time
 *   3. Merkle proof         — disclosed/undisclosed leaves -> student root -> on-chain batch root
 *   4. revocation status    — RevocationRegistry.isRevoked
 * Stops at the first failing check and returns a clear reason for each step
 * that ran. All trust anchors (issuer address, root, timestamp, signing key,
 * revocation flag) are read from the chain — nothing from the presentation
 * itself is trusted for authorization decisions.
 *
 * @param {object} presentation - see disclosure.buildSelectiveDisclosure()
 * @param {{issuerRegistry: ethers.Contract, credentialAnchor: ethers.Contract, revocationRegistry: ethers.Contract}} contracts
 * @returns {Promise<{valid: boolean, checks: Array<{name: string, passed: boolean, reason: string}>}>}
 */
async function verifyPresentation(presentation, contracts) {
  const checks = [];

  let issuerInstitutionAddress;
  try {
    issuerInstitutionAddress = await contracts.credentialAnchor.batchIssuerOf(presentation.batchId);
    const isActive = await contracts.issuerRegistry.isActiveIssuer(issuerInstitutionAddress);
    if (!isActive) {
      checks.push({
        name: "issuer_membership",
        passed: false,
        reason: `Issuer ${issuerInstitutionAddress} is not an active consortium member`,
      });
      return finalize(checks);
    }
    checks.push({
      name: "issuer_membership",
      passed: true,
      reason: `Issuer ${issuerInstitutionAddress} is an active consortium member`,
    });
  } catch (err) {
    checks.push({ name: "issuer_membership", passed: false, reason: `Could not resolve batch issuer: ${err.message}` });
    return finalize(checks);
  }

  let batchRoot;
  try {
    batchRoot = await contracts.credentialAnchor.getBatchRoot(presentation.batchId);
    const batchTimestamp = await contracts.credentialAnchor.getBatchTimestamp(presentation.batchId);
    const recovered = ethers.verifyMessage(ethers.getBytes(batchRoot), presentation.batchSignature);
    const expectedKey = await contracts.issuerRegistry.signingKeyAt(issuerInstitutionAddress, batchTimestamp);
    if (recovered.toLowerCase() !== expectedKey.toLowerCase()) {
      checks.push({
        name: "signature",
        passed: false,
        reason: `Signature was made by ${recovered}, but the issuer's key valid at issuance time (t=${batchTimestamp}) was ${expectedKey}`,
      });
      return finalize(checks);
    }
    checks.push({
      name: "signature",
      passed: true,
      reason: `Batch root signed by the issuer key valid at issuance time (${expectedKey})`,
    });
  } catch (err) {
    checks.push({ name: "signature", passed: false, reason: `Signature check failed: ${err.message}` });
    return finalize(checks);
  }

  try {
    const leaves = presentation.fieldOrder.map((fieldName) => {
      if (Object.prototype.hasOwnProperty.call(presentation.disclosedFields, fieldName)) {
        const { value, salt } = presentation.disclosedFields[fieldName];
        return hashField(fieldName, value, salt);
      }
      const h = presentation.undisclosedFieldHashes[fieldName];
      if (!h) throw new Error(`missing leaf hash for undisclosed field "${fieldName}"`);
      return h;
    });
    const { root: recomputedStudentRoot } = buildMerkleTree(leaves);
    if (recomputedStudentRoot.toLowerCase() !== presentation.studentRoot.toLowerCase()) {
      checks.push({
        name: "merkle_proof",
        passed: false,
        reason: "Disclosed/undisclosed fields do not reconstruct the claimed student root (tampered field or salt)",
      });
      return finalize(checks);
    }
    const batchLeaf = wrapAsBatchLeaf(recomputedStudentRoot);
    const included = verifyProof(batchLeaf, presentation.batchLeafProof, batchRoot);
    if (!included) {
      checks.push({
        name: "merkle_proof",
        passed: false,
        reason: "Student root is not included under the on-chain anchored batch root (forged proof or wrong batch)",
      });
      return finalize(checks);
    }
    checks.push({
      name: "merkle_proof",
      passed: true,
      reason: "Disclosed fields verified against the on-chain anchored batch root",
    });
  } catch (err) {
    checks.push({ name: "merkle_proof", passed: false, reason: `Merkle verification failed: ${err.message}` });
    return finalize(checks);
  }

  try {
    const revoked = await contracts.revocationRegistry.isRevoked(presentation.credentialId);
    if (revoked) {
      checks.push({ name: "revocation_status", passed: false, reason: "Credential has been revoked by the issuing institution" });
      return finalize(checks);
    }
    checks.push({ name: "revocation_status", passed: true, reason: "Credential is not revoked" });
  } catch (err) {
    checks.push({ name: "revocation_status", passed: false, reason: `Revocation check failed: ${err.message}` });
    return finalize(checks);
  }

  return finalize(checks);
}

function finalize(checks) {
  return { valid: checks.length === 4 && checks.every((c) => c.passed), checks };
}

module.exports = { verifyPresentation };
