import { DonizettiPluginError, type PluginErrorCode } from "@donizetti/tauri";

import { fill, appStrings as text } from "../strings";
import { baseName } from "./names";

/** Every code the plugin's client can give, with its message. */
const errors: Readonly<Record<PluginErrorCode, string>> = text.errors;

/**
 * What to tell the user about a failure: the plugin's error from its code and parameters (the file's name, the
 * page), or `fallback` for anything else. The error's `detail` is for logs, never shown.
 */
export function messageOf(error: unknown, fallback: string): string {
  if (!(error instanceof DonizettiPluginError)) return fallback;
  const { path, page } = error.params;
  return fill(errors[error.code], {
    ...(typeof path === "string" && { name: baseName(path) }),
    ...(typeof page === "number" && { page }),
  });
}
