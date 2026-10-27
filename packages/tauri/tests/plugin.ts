import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach } from "vitest";

/** One call the client made: the command, its arguments and its options (headers). */
export interface Call {
  command: string;
  args: InvokeArgs | undefined;
  options: InvokeOptions | undefined;
}

type Handler = (call: Call) => unknown;

interface TauriInternals {
  invoke: (command: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown>;
  runCallback: (id: number, data: unknown) => void;
}

function internals(): TauriInternals {
  return (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
}

/**
 * Stands in for the plugin with Tauri's own IPC mocks, so channels work as in the app; `handler`
 * answers each call (a thrown value or a rejected promise is the command's error). Unlike `mockIPC`
 * alone, the handler also sees the call's options, where `writeScore` puts its headers. Returns the
 * calls made.
 */
export function mockPlugin(handler: Handler): Call[] {
  mockIPC(() => undefined);
  const calls: Call[] = [];
  internals().invoke = async (command, args, options) => {
    const made = { command, args, options };
    calls.push(made);
    return handler(made);
  };
  return calls;
}

/** Sends a message to the app on a channel the client passed, as the Rust side does. */
export function sendOnChannel(channel: unknown, index: number, message: unknown): void {
  internals().runCallback((channel as { id: number }).id, { index, message });
}

afterEach(() => {
  clearMocks();
});
