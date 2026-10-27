import {
  createScoreEngine,
  cursorSteps,
  midiFile,
  type ScoreEngine,
  type ScorePlayback,
  type ScoreStep,
  type ScoreTiming,
  scoreNotes,
  stepOfNote,
} from "@donizetti/playback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DrawnScore } from "../drawing/drawn-score";

/** How long the music may take to reach where it was moved to before the cursor follows it again (50 ms ticks). */
const SEEK_TICKS = 20;

export type PlayerState = "stopped" | "playing" | "paused";

/** The score's playback: what the toolbar and the keys need. */
export type ScorePlayer = {
  /** Whether playback is possible at all (the host gave a soundfont). */
  available: boolean;
  state: PlayerState;
  failed: boolean;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  stop: () => void;
  /** Moves the cursor (and the music, when loaded) to a written note: its measure, and whole notes into it. */
  seek: (measure: number, onset: number) => void;
  /** Sounds one note (entering or selecting it). */
  preview: (midi: number) => void;
};

type Loaded = { timing: ScoreTiming; steps: ScoreStep[]; playback: ScorePlayback };

/**
 * Plays the drawn score through the host's soundfont (decision 10), the OSMD cursor following the music through
 * its repeats. The music is made again after each edit, when it is next played.
 */
export function useScorePlayer(
  drawn: DrawnScore | null,
  soundfont: (() => Promise<ArrayBuffer | Uint8Array>) | undefined,
  name: string,
): ScorePlayer {
  const engine = useMemo<ScoreEngine | null>(() => (soundfont ? createScoreEngine({ soundfont }) : null), [soundfont]);
  const loaded = useRef<Loaded | null>(null);
  const step = useRef(0);
  const startAt = useRef<{ seconds: number; step: number } | null>(null);
  const seeking = useRef<{ seconds: number; ticks: number } | null>(null);
  const [state, setState] = useState<PlayerState>("stopped");
  const [failed, setFailed] = useState(false);

  useEffect(() => () => engine?.dispose(), [engine]);

  // A new drawing (after an edit) needs new music: the old one stops.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the drawing is what starts it, not a value it reads.
  useEffect(() => {
    loaded.current?.playback.stop();
    loaded.current = null;
    step.current = 0;
    seeking.current = null;
    setState("stopped");
  }, [drawn]);

  useEffect(() => {
    if (state !== "playing") return undefined;
    const timer = window.setInterval(() => {
      const music = loaded.current;
      if (!music || !drawn) return;
      const now = music.playback.time();
      const moved = seeking.current;
      if (moved) {
        moved.ticks -= 1;
        if (Math.abs(now - moved.seconds) > 0.5 && moved.ticks > 0) return;
        seeking.current = null;
      }
      while (step.current + 1 < music.steps.length && music.steps[step.current + 1]!.seconds <= now) {
        drawn.osmd.cursor.next();
        step.current += 1;
      }
      if (now >= music.timing.duration) {
        music.playback.stop();
        drawn.osmd.cursor.hide();
        step.current = 0;
        setState("stopped");
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [state, drawn]);

  const moveCursorTo = useCallback(
    (index: number) => {
      if (!drawn) return;
      const { cursor } = drawn.osmd;
      cursor.reset();
      for (let moved = 0; moved < index; moved += 1) cursor.next();
      cursor.show();
      step.current = index;
    },
    [drawn],
  );

  const load = useCallback(async (): Promise<Loaded | null> => {
    if (loaded.current) return loaded.current;
    if (!engine || !drawn) return null;
    const timing = scoreNotes(drawn.osmd.Sheet);
    const steps = cursorSteps(drawn.osmd.cursor, timing);
    const playback = await engine.load(midiFile(timing), name);
    loaded.current = { timing, steps, playback };
    return loaded.current;
  }, [engine, drawn, name]);

  const play = useCallback(async () => {
    setFailed(false);
    try {
      const music = await load();
      if (!music || !drawn) return;
      if (state === "stopped") {
        const from = startAt.current;
        moveCursorTo(from?.step ?? 0);
        if (from) music.playback.seek(from.seconds);
      }
      await music.playback.play();
      setState("playing");
    } catch {
      setFailed(true);
      setState("stopped");
    }
  }, [load, drawn, state, moveCursorTo]);

  const pause = useCallback(() => {
    loaded.current?.playback.pause();
    setState("paused");
  }, []);

  const stop = useCallback(() => {
    loaded.current?.playback.stop();
    drawn?.osmd.cursor.reset();
    drawn?.osmd.cursor.hide();
    step.current = 0;
    startAt.current = null;
    seeking.current = null;
    setState("stopped");
  }, [drawn]);

  const toggle = useCallback(() => (state === "playing" ? Promise.resolve(pause()) : play()), [state, pause, play]);

  const seek = useCallback(
    (measure: number, onset: number) => {
      const music = loaded.current;
      if (!drawn) return;
      // Steps are made with the music; before the first play, the place is kept for it.
      const steps = music?.steps ?? cursorSteps(drawn.osmd.cursor, scoreNotes(drawn.osmd.Sheet));
      const index = stepOfNote(steps, measure, onset);
      if (index === null) return;
      const seconds = steps[index]!.seconds;
      startAt.current = { seconds, step: index };
      if (music && state !== "stopped") {
        moveCursorTo(index);
        seeking.current = { seconds, ticks: SEEK_TICKS };
        music.playback.seek(seconds);
      }
    },
    [drawn, state, moveCursorTo],
  );

  const preview = useCallback(
    (midi: number) => {
      if (state === "playing") return;
      engine?.previewNote(midi).catch(() => undefined);
    },
    [engine, state],
  );

  return { available: engine !== null, state, failed, play, pause, toggle, stop, seek, preview };
}
