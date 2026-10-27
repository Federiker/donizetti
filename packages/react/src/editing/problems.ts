import { ScoreEditError } from "@donizetti/musicxml";

import { enGB, type MessageKey } from "../strings/en-GB";

/** The message for an edit the score could not take: its own when there is one (`edit.<code>`), else a general one. */
export function problemOf(error: unknown): MessageKey {
  if (error instanceof ScoreEditError) {
    const key = `edit.${error.code}`;
    if (key in enGB) return key as MessageKey;
  }
  return "edit.failed";
}
