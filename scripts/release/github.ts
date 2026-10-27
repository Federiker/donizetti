// The GitHub REST API calls a release needs, with `fetch` and the token from .env (a fine-grained
// token with Contents: read and write on the repository). The token goes only in the requests'
// `Authorization` header; the messages show the calls and GitHub's answers, never the token.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { repository } from "./packages";
import { fail } from "./run";

const api = `https://api.github.com/repos/${repository.owner}/${repository.name}`;

interface Asset {
  name: string;
  size: number;
  /** "uploaded", or "open" for an upload that never finished. */
  state: string;
}

export interface Release {
  id: number;
  html_url: string;
  /** The assets' upload address, a URI template: `https://uploads.github.com/…/assets{?name,label}`. */
  upload_url: string;
  assets: Asset[];
}

/** The calls a release makes, as the dry run lists them. */
export const calls = {
  repository: `GET ${api}`,
  release: (tag: string) => `GET ${api}/releases/tags/${tag}`,
  create: `POST ${api}/releases`,
  upload: (name: string) =>
    `POST https://uploads.github.com/repos/${repository.owner}/${repository.name}/releases/<id>/assets?name=${name}`,
};

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "donizetti-release",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

/** Fails with GitHub's answer: its status and its message, which never holds the token. */
async function refused(call: string, response: Response): Promise<never> {
  const text = await response.text();
  let message = text;
  try {
    const parsed = JSON.parse(text) as { message?: string; errors?: unknown };
    message = [parsed.message, parsed.errors ? JSON.stringify(parsed.errors) : ""].filter(Boolean).join(" ");
  } catch {
    // Not JSON: GitHub's text as it is.
  }
  return fail(`GitHub refused ${call}: ${response.status} ${response.statusText}${message ? `, ${message}` : ""}.`);
}

/** The status GitHub answers reading the repository with the token: 200 when it may. */
export async function repositoryStatus(token: string): Promise<number> {
  const response = await fetch(api, { headers: headers(token) });
  await response.body?.cancel();
  return response.status;
}

/** The published release for a tag, or null when there is none. */
export async function releaseByTag(token: string, tag: string): Promise<Release | null> {
  const response = await fetch(`${api}/releases/tags/${tag}`, { headers: headers(token) });
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) return refused(calls.release(tag), response);
  return (await response.json()) as Release;
}

/** Creates the release for a tag that is on GitHub already: published, not a draft nor a prerelease. */
export async function createRelease(token: string, tag: string, name: string, body: string): Promise<Release> {
  const response = await fetch(`${api}/releases`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ tag_name: tag, name, body, draft: false, prerelease: false }),
  });
  if (!response.ok) return refused(calls.create, response);
  return (await response.json()) as Release;
}

/** Uploads a tarball to a release as an asset named as the file is. */
export async function uploadAsset(token: string, release: Release, file: string): Promise<Asset> {
  const name = basename(file);
  const url = new URL(release.upload_url.replace(/\{[^}]*\}$/, ""));
  url.searchParams.set("name", name);
  const bytes = readFileSync(file);
  const response = await fetch(url, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/gzip", "Content-Length": String(bytes.length) }),
    body: bytes,
  });
  if (!response.ok) return refused(calls.upload(name), response);
  return (await response.json()) as Asset;
}
