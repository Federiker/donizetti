/**
 * A stand-in for OpenSheetMusicDisplay in jsdom (which cannot lay out SVG): it "draws" one SVG page with a
 * notehead per note of the score's first part, and answers OSMD's questions about them, so the editor's own
 * code runs as it does in a browser. The real drawing is checked by the end-to-end tests.
 */
import { mapScore, midiOf, readScore } from "@donizetti/musicxml";

export const created: FakeDisplay[] = [];

type FakeNote = {
  sourceNote: unknown;
  PositionAndShape: { AbsolutePosition: { x: number; y: number } };
  getNoteheadSVGs: () => Element[];
  getSVGGElement: () => Element | undefined;
};

export class FakePoint {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export class FakeDisplay {
  text = "";
  options: Record<string, unknown>;
  rendered = 0;
  notes: FakeNote[] = [];
  Sheet: unknown;
  GraphicSheet: unknown;
  cursor = {
    reset: () => undefined,
    next: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    Iterator: { EndReached: true },
  };

  constructor(
    private container: HTMLElement,
    options: Record<string, unknown>,
  ) {
    this.options = options;
    created.push(this);
  }

  async load(text: string) {
    this.text = text;
  }

  setOptions(options: Record<string, unknown>) {
    this.options = { ...this.options, ...options };
  }

  render() {
    this.rendered += 1;
    this.container.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.container.appendChild(svg);
    const map = mapScore(readScore(this.text).root);
    const staff = { ParentInstrument: null as unknown };
    const instrument = { Staves: [staff] };
    staff.ParentInstrument = instrument;
    const measures = (map?.measures ?? []).map(() => ({}));
    this.notes = [];
    for (const measure of map?.measures ?? []) {
      for (const note of measure.notes) {
        const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
        head.setAttribute("class", "vf-notehead");
        svg.appendChild(head);
        const index = this.notes.length;
        this.notes.push({
          sourceNote: {
            ParentStaff: staff,
            ParentVoiceEntry: { Timestamp: { RealValue: note.onset }, IsGrace: note.grace },
            SourceMeasure: measures[measure.index],
            IsGraceNote: note.grace,
            isRest: () => note.rest,
            Pitch: note.pitch,
            halfTone: note.pitch ? midiOf(note.pitch) - 12 : 0,
          },
          PositionAndShape: { AbsolutePosition: { x: index, y: 0 } },
          getNoteheadSVGs: () => [head],
          getSVGGElement: () => undefined,
        });
      }
    }
    this.Sheet = { Instruments: [instrument], SourceMeasures: measures };
    const notes = this.notes;
    this.GraphicSheet = {
      MeasureList: [[{ staffEntries: [{ graphicalVoiceEntries: [{ notes }] }] }]],
      domToSvg: (point: FakePoint) => point,
      svgToOsmd: (point: FakePoint) => point,
      svgToDom: (point: FakePoint) => point,
      // A click at x = n is on the nth note.
      GetNearestNote: (point: FakePoint) => notes[Math.round(point.x)] ?? null,
    };
  }

  clear() {
    this.container.innerHTML = "";
  }
}
