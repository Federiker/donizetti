# @donizetti/musicxml

The score as a MusicXML document: reading and writing `.musicxml`, `.xml` and
`.mxl` with everything an edit does not touch kept exactly as written, the
score map (measures, notes and where they fall) and what can be edited. Plain
TypeScript on the DOM (`DOMParser`, `XMLSerializer`, `MutationObserver`); no
drawing. See [the score document](../../docs/features/musicxml.md).

```ts
import { readScore, writeScore, mapScore, editabilityOf } from "@donizetti/musicxml";

const score = readScore(bytes); // .musicxml, .xml or .mxl
const map = mapScore(score.root);
const bytesAgain = writeScore(score); // the same bytes while unchanged
```

Tests run in jsdom (`bun run --filter @donizetti/musicxml test`); fixtures are
described in [tests/fixtures/README.md](tests/fixtures/README.md).
