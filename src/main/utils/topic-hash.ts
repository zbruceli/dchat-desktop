import crypto from "crypto";

/**
 * Generate the NKN topic hash from a human-readable topic name.
 * nMobile convention: strip leading '#' chars, SHA-1 hash, hex-encode, prefix with "dchat".
 * e.g. "d-chat" -> "dchat" + hex(sha1("d-chat"))
 */
export function genTopicHash(topicName: string): string {
  const cleaned = topicName.replace(/^#+/, "");
  const hash = crypto.createHash("sha1").update(cleaned).digest("hex");
  return "dchat" + hash;
}
