import { type InvokeArgs, type InvokeOptions, invoke } from "@tauri-apps/api/core";
import { toPluginError } from "./errors";

/** The plugin's commands, as `build.rs` lists them. */
export type PluginCommand =
  | "read_score"
  | "write_score"
  | "soundfont_status"
  | "install_soundfont"
  | "cancel_soundfont_install"
  | "read_soundfont"
  | "remove_soundfont"
  | "export_pdf"
  | "write_export";

/** Calls `plugin:donizetti|<command>`; a failure is always a `DonizettiPluginError`. */
export async function call(command: PluginCommand, args?: InvokeArgs, options?: InvokeOptions): Promise<unknown> {
  try {
    return await invoke(`plugin:donizetti|${command}`, args, options);
  } catch (cause) {
    throw toPluginError(cause);
  }
}
