import crypto from "crypto";
import nkn from "nkn-sdk";

/**
 * Extract the public key hex string from an NKN address.
 * NKN addresses can be: `<identifier>.<pubkey>` or just `<pubkey>`.
 * The public key is always the last dot-separated segment.
 */
export function getPubKeyFromAddress(address: string): string {
  const parts = address.split(".");
  return parts[parts.length - 1];
}

/**
 * Generate an Ed25519 signature over rawData using nkn-sdk's sign function.
 * nMobile convention: SHA256(rawData) → hex → Ed25519 sign → hex signature.
 */
export async function genSignature(
  privateKey: Uint8Array,
  rawData: string,
): Promise<string> {
  // SHA256 hash of the raw data string
  const hash = crypto.createHash("sha256").update(rawData).digest("hex");
  // nkn.crypto.sign signs hex-encoded message with Ed25519 private key
  const signature = await nkn.crypto.sign(privateKey, hash);
  return signature;
}

/**
 * Verify an Ed25519 signature using libsodium (same as nMobile).
 * Steps: SHA256(rawData) → hex → verify with public key.
 */
export async function verifySignature(
  publicKeyHex: string,
  rawData: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sodium = require("libsodium-wrappers");
    await sodium.ready;

    const hash = crypto.createHash("sha256").update(rawData).digest("hex");
    const messageBytes = sodium.from_hex(hash);
    const signatureBytes = sodium.from_hex(signatureHex);
    const publicKeyBytes = sodium.from_hex(publicKeyHex);

    return sodium.crypto_sign_verify_detached(signatureBytes, messageBytes, publicKeyBytes);
  } catch (err) {
    console.error("[ed25519] Signature verification failed:", err);
    return false;
  }
}

/**
 * Build the raw data string for a member entry (sorted JSON keys).
 * nMobile convention: JSON with keys sorted alphabetically.
 */
export function buildMemberRawData(fields: {
  expiresAt: number;
  groupId: string;
  invitee: string;
  inviter: string;
  permission: number;
}): string {
  // Sort keys alphabetically — nMobile uses sorted JSON
  const sorted = {
    expiresAt: fields.expiresAt,
    groupId: fields.groupId,
    invitee: fields.invitee,
    inviter: fields.inviter,
    permission: fields.permission,
  };
  return JSON.stringify(sorted);
}

/**
 * Build the raw data string for a group (sorted JSON keys).
 */
export function buildGroupRawData(fields: {
  deleteAfterSeconds: number;
  groupId: string;
  name: string;
  type: number;
}): string {
  const sorted = {
    deleteAfterSeconds: fields.deleteAfterSeconds,
    groupId: fields.groupId,
    name: fields.name,
    type: fields.type,
  };
  return JSON.stringify(sorted);
}

/**
 * Compute group version string.
 * Format: `{commits}.{hex(MD5(ownerSignature + sorted memberKeys))}`
 * where memberKeys = `{perm}_{invitee}` sorted alphabetically.
 */
export function genGroupVersion(
  commits: number,
  ownerSignature: string,
  members: Array<{ permission: number; invitee: string }>,
): string {
  // Build sorted member keys: "{perm}_{invitee}"
  const memberKeys = members
    .map((m) => `${m.permission}_${m.invitee}`)
    .sort();

  const input = ownerSignature + memberKeys.join("");
  const hash = crypto.createHash("md5").update(input).digest("hex");
  return `${commits}.${hash}`;
}
