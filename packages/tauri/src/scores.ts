import { binaryAnswer } from "./bytes";
import { call } from "./call";
import { invalidResponse } from "./errors";

/** A score as it is on disk, and the hash a later save quotes to show it still has that file. */
export interface ScoreFile {
  bytes: Uint8Array;
  /** SHA-256 of the bytes, in lower-case hexadecimal (64 characters). */
  hash: string;
}

export interface ScoreWrite {
  path: string;
  /** The `.musicxml`, `.xml` or `.mxl` file's bytes, as `<ScoreEditor>` saves them. */
  bytes: Uint8Array;
  /**
   * The hash `readScore` (or the previous `writeScore`) gave: the file is written only if it is still
   * that one, else the save fails with `changed_on_disk` and nothing is written. Left out, the file is
   * written whatever is there (a new file, or Save As).
   */
  expectedHash?: string;
}

const HASH = /^[0-9a-f]{64}$/;
const HASH_LENGTH = 64;

/**
 * Reads a score's bytes and hash. The plugin answers both in one binary message, the hash's 64
 * characters first, so the file never travels as JSON.
 *
 * @throws DonizettiPluginError `read_failed` (with `path` and `detail`), or `invalid_response`.
 */
export async function readScore(path: string): Promise<ScoreFile> {
  const answer = binaryAnswer(await call("read_score", { path }));
  if (!answer || answer.length < HASH_LENGTH) throw invalidResponse("read_score", "not a hash and a file");
  const hash = new TextDecoder().decode(answer.subarray(0, HASH_LENGTH));
  if (!HASH.test(hash)) throw invalidResponse("read_score", "the answer does not start with a hash");
  return { bytes: answer.slice(HASH_LENGTH), hash };
}

/**
 * Writes a score in one rename (a temporary file beside it, then renamed over it, so the file is never
 * half written) and resolves to its new hash. The bytes are the request's raw body; the path and the
 * expected hash travel in headers, the path percent-encoded.
 *
 * @throws DonizettiPluginError `changed_on_disk` (with `path`, `expectedHash` and `actualHash`),
 * `read_failed`, `write_failed` or `invalid_request`; the file is as it was after any of them.
 */
export async function writeScore({ path, bytes, expectedHash }: ScoreWrite): Promise<string> {
  const headers: Record<string, string> = { "Donizetti-Path": encodeURIComponent(path) };
  if (expectedHash !== undefined) headers["Donizetti-Expected-Hash"] = expectedHash;
  const hash = await call("write_score", bytes, { headers });
  if (typeof hash !== "string" || !HASH.test(hash)) throw invalidResponse("write_score", "not a hash");
  return hash;
}
