import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notePreviewer, PREVIEW_CHANNEL, previewSettings } from "../src/preview";

describe("note previews", () => {
  it("fills in the defaults: a piano on the preview channel, at 100, for half a second", () => {
    expect(previewSettings(60)).toEqual({
      midi: 60,
      velocity: 100,
      durationMs: 500,
      program: 0,
      channel: PREVIEW_CHANNEL,
    });
    expect(previewSettings(61, { velocity: 30, durationMs: 120, program: 73 })).toEqual({
      midi: 61,
      velocity: 30,
      durationMs: 120,
      program: 73,
      channel: PREVIEW_CHANNEL,
    });
  });

  it("leaves a score channel's instrument alone unless a program is given", () => {
    expect(previewSettings(38, { channel: 9 })).toEqual({ midi: 38, velocity: 100, durationMs: 500, channel: 9 });
    expect(previewSettings(60, { channel: 2, program: 40 })).toMatchObject({ channel: 2, program: 40 });
  });

  it("refuses a key or option out of range", () => {
    expect(() => previewSettings(128)).toThrow(RangeError);
    expect(() => previewSettings(-1)).toThrow(/key must be a whole number from 0 to 127, not -1/);
    expect(() => previewSettings(60.5)).toThrow(RangeError);
    expect(() => previewSettings(60, { velocity: 0 })).toThrow(/velocity/);
    expect(() => previewSettings(60, { program: 128 })).toThrow(/program/);
    expect(() => previewSettings(60, { channel: 16 })).toThrow(/channel/);
    expect(() => previewSettings(60, { durationMs: 0 })).toThrow(/durationMs/);
    expect(() => previewSettings(60, { durationMs: Number.NaN })).toThrow(/durationMs/);
  });

  describe("playing", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const synth = () => ({ noteOn: vi.fn(), noteOff: vi.fn(), programChange: vi.fn() });

    it("sets the instrument, sounds the note and stops it after its time", () => {
      const fake = synth();
      notePreviewer(fake).play(previewSettings(64, { program: 73, durationMs: 300 }));
      expect(fake.programChange).toHaveBeenCalledWith(PREVIEW_CHANNEL, 73);
      expect(fake.noteOn).toHaveBeenCalledWith(PREVIEW_CHANNEL, 64, 100);
      vi.advanceTimersByTime(299);
      expect(fake.noteOff).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fake.noteOff).toHaveBeenCalledWith(PREVIEW_CHANNEL, 64);
      vi.advanceTimersByTime(1000);
      expect(fake.noteOff).toHaveBeenCalledTimes(1);
    });

    it("starts the same key again rather than letting the earlier note's end cut it short", () => {
      const fake = synth();
      const preview = notePreviewer(fake);
      preview.play(previewSettings(60, { durationMs: 500 }));
      vi.advanceTimersByTime(400);
      preview.play(previewSettings(60, { durationMs: 500 }));
      // The first note ends as the second starts.
      expect(fake.noteOff).toHaveBeenCalledTimes(1);
      expect(fake.noteOn).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(499);
      expect(fake.noteOff).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(fake.noteOff).toHaveBeenCalledTimes(2);
    });

    it("plays on a score channel without changing its instrument, and stops every note on request", () => {
      const fake = synth();
      const preview = notePreviewer(fake);
      preview.play(previewSettings(38, { channel: 9 }));
      preview.play(previewSettings(67));
      expect(fake.programChange).toHaveBeenCalledTimes(1);
      preview.stop();
      expect(fake.noteOff.mock.calls).toEqual([
        [9, 38],
        [PREVIEW_CHANNEL, 67],
      ]);
      vi.advanceTimersByTime(1000);
      expect(fake.noteOff).toHaveBeenCalledTimes(2);
    });
  });
});
