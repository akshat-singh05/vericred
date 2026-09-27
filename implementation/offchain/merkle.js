const { ethers } = require("ethers");

const LEAF_TAG = Uint8Array.of(0x00); // field-level leaf: H(0x00 || fieldNameHash || valueHash || salt)
const NODE_TAG = Uint8Array.of(0x01); // internal Merkle node: H(0x01 || min(a,b) || max(a,b))
const BATCH_LEAF_TAG = Uint8Array.of(0x02); // wraps a student root so it can't be confused with a raw field leaf

/**
 * Domain-tagged, sorted-pair (commutative) internal node hash. Sorting the
 * pair removes any left/right ordering ambiguity, and the 0x01 tag stops an
 * internal node's hash from ever being reinterpreted as a leaf (or vice
 * versa) — the standard second-preimage mitigation for naive Merkle trees.
 */
function hashPair(a, b) {
  const [x, y] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([NODE_TAG, x, y]));
}

/** leaf_i = H(0x00 || H(fieldName) || H(value) || salt) — see PLAN.md/paper §7 for the formal notation. */
function hashField(fieldName, value, saltHex) {
  const fieldNameHash = ethers.keccak256(ethers.toUtf8Bytes(fieldName));
  const valueHash = ethers.keccak256(ethers.toUtf8Bytes(String(value)));
  return ethers.keccak256(ethers.concat([LEAF_TAG, fieldNameHash, valueHash, saltHex]));
}

function wrapAsBatchLeaf(studentRoot) {
  return ethers.keccak256(ethers.concat([BATCH_LEAF_TAG, studentRoot]));
}

function randomSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Builds a Merkle tree over `leaves` (array of bytes32 hex strings).
 * An odd node at any level is promoted unchanged to the next level rather
 * than duplicated, avoiding the classic duplicate-last-leaf ambiguity.
 * Returns { root, layers } where layers[0] === leaves and layers[last] === [root].
 */
function buildMerkleTree(leaves) {
  if (!leaves || leaves.length === 0) throw new Error("buildMerkleTree: no leaves");
  const layers = [leaves.slice()];
  let current = leaves.slice();
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(hashPair(current[i], current[i + 1]));
      } else {
        next.push(current[i]);
      }
    }
    layers.push(next);
    current = next;
  }
  return { root: current[0], layers };
}

/** Inclusion proof for the leaf at `leafIndex`, as a list of {sibling, position}. */
function getProof(layers, leafIndex) {
  const proof = [];
  let index = leafIndex;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const isRightNode = index % 2 === 1;
    const pairIndex = isRightNode ? index - 1 : index + 1;
    if (pairIndex < layer.length) {
      proof.push({ sibling: layer[pairIndex], position: isRightNode ? "left" : "right" });
    }
    index = Math.floor(index / 2);
  }
  return proof;
}

function verifyProof(leaf, proof, root) {
  let computed = leaf;
  for (const step of proof) {
    computed = hashPair(computed, step.sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}

module.exports = {
  hashPair,
  hashField,
  wrapAsBatchLeaf,
  randomSalt,
  buildMerkleTree,
  getProof,
  verifyProof,
};
