// JS mirror of contracts/lib/CredentialId.sol — must stay bit-for-bit
// identical, since the backend/frontend compute these IDs off-chain and
// pass them into RevocationRegistry.revoke()/isRevoked() on-chain.
const SINGLE_FLAG = 1n << 255n;
const LEAF_INDEX_BITS = 32n;

const CredentialId = {
  encodeBatchCredential(batchId, leafIndex) {
    const b = BigInt(batchId);
    const l = BigInt(leafIndex);
    if (b >= 1n << 160n) throw new Error("CredentialId: batchId overflow");
    return (b << LEAF_INDEX_BITS) | l;
  },

  decodeBatchCredential(credentialId) {
    const id = BigInt(credentialId);
    if (id & SINGLE_FLAG) throw new Error("CredentialId: not a batch credential");
    const batchId = id >> LEAF_INDEX_BITS;
    const leafIndex = Number(id & ((1n << LEAF_INDEX_BITS) - 1n));
    return { batchId, leafIndex };
  },

  encodeSingleCredential(singleId) {
    const s = BigInt(singleId);
    if (s >= SINGLE_FLAG) throw new Error("CredentialId: singleId overflow");
    return SINGLE_FLAG | s;
  },

  decodeSingleCredential(credentialId) {
    const id = BigInt(credentialId);
    if (!(id & SINGLE_FLAG)) throw new Error("CredentialId: not a single credential");
    return id & ~SINGLE_FLAG;
  },

  isSingle(credentialId) {
    return (BigInt(credentialId) & SINGLE_FLAG) !== 0n;
  },
};

module.exports = { CredentialId };
