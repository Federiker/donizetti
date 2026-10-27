import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach } from "vitest";

/** One call the app made: the command, its arguments and its options (where the plugin's headers go). */
export interface Call {
  command: string;
  args: InvokeArgs | undefined;
  options: InvokeOptions | undefined;
}

type TauriInternals = {
  invoke: (command: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown>;
};

/**
 * Stands in for the Tauri window with Tauri's own IPC mocks; `handler` answers each call (a thrown value is
 * the command's error). Unlike `mockIPC` alone, the handler also sees the call's options. Returns the calls.
 */
export function mockTauri(handler: (call: Call) => unknown): Call[] {
  mockIPC(() => undefined);
  const calls: Call[] = [];
  const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
  internals.invoke = async (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    return handler(call);
  };
  return calls;
}

afterEach(() => {
  clearMocks();
});
