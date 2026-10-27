/**
 * Where each node of a parsed score was written in its text, and which nodes have changed since, so that a
 * changed score is written back with every untouched element, attribute, entity and space exactly as it was
 * (decision 3): `XMLSerializer` alone would rewrite `<a></a>` as `<a/>`, quotes and entities its own way.
 */

/** Where a node was written: from `start` to `end`; an element's start tag ends at `tagEnd`, its end tag starts at `closeStart`. */
type Span = { start: number; end: number; tagEnd: number; closeStart: number; selfClosing: boolean };

type Token =
  | { kind: "open"; name: string; start: number; end: number; selfClosing: boolean }
  | { kind: "close"; start: number; end: number }
  | { kind: "text" | "comment" | "cdata" | "pi"; start: number; end: number };

/** What changed since the text was read: elements whose attributes or children changed, and changed text. */
type Changes = { attributes: WeakSet<Node>; children: WeakSet<Node>; data: WeakSet<Node>; any: boolean };

/** The text a score was read from, where each of its nodes came from, and what has changed since. */
export type SourceText = {
  readonly text: string;
  readonly spans: WeakMap<Node, Span> | null;
  readonly changes: Changes;
  readonly observer: MutationObserver | null;
};

class Mismatch extends Error {}

/** The markup and text from `from` to the root element's end, in order. The text is well-formed XML. */
function tokenize(text: string, from: number, to: number): Token[] {
  const tokens: Token[] = [];
  let at = from;
  while (at < to) {
    if (text[at] !== "<") {
      const next = text.indexOf("<", at);
      const end = next < 0 || next > to ? to : next;
      tokens.push({ kind: "text", start: at, end });
      at = end;
    } else if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at) + 3;
      tokens.push({ kind: "comment", start: at, end });
      at = end;
    } else if (text.startsWith("<![CDATA[", at)) {
      const end = text.indexOf("]]>", at) + 3;
      tokens.push({ kind: "cdata", start: at, end });
      at = end;
    } else if (text.startsWith("<?", at)) {
      const end = text.indexOf("?>", at) + 2;
      tokens.push({ kind: "pi", start: at, end });
      at = end;
    } else if (text[at + 1] === "/") {
      const end = text.indexOf(">", at) + 1;
      tokens.push({ kind: "close", start: at, end });
      at = end;
    } else {
      // A start tag: its end is the first ">" outside a quoted attribute value.
      let end = at + 1;
      let quote: string | null = null;
      for (; end < text.length; end += 1) {
        const character = text[end];
        if (quote) {
          if (character === quote) quote = null;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === ">") break;
      }
      const name = /^<([^\s/>]+)/.exec(text.slice(at, end + 1))?.[1] ?? "";
      tokens.push({ kind: "open", name, start: at, end: end + 1, selfClosing: text[end - 1] === "/" });
      at = end + 1;
    }
  }
  return tokens;
}

/** Each node of the root's tree matched with the token it was parsed from, in document order. */
function assignSpans(root: Element, tokens: Token[]): WeakMap<Node, Span> {
  const spans = new WeakMap<Node, Span>();
  let index = 0;
  const take = () => {
    const token = tokens[index];
    if (!token) throw new Mismatch();
    index += 1;
    return token;
  };
  const visit = (node: Node) => {
    const token = take();
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (token.kind !== "open" || token.name !== node.nodeName) throw new Mismatch();
      const span: Span = {
        start: token.start,
        end: token.end,
        tagEnd: token.end,
        closeStart: token.end,
        selfClosing: token.selfClosing,
      };
      if (!token.selfClosing) {
        for (const child of Array.from(node.childNodes)) visit(child);
        const close = take();
        if (close.kind !== "close") throw new Mismatch();
        span.closeStart = close.start;
        span.end = close.end;
      } else if (node.childNodes.length > 0) throw new Mismatch();
      spans.set(node, span);
      return;
    }
    const kind =
      node.nodeType === Node.TEXT_NODE
        ? "text"
        : node.nodeType === Node.COMMENT_NODE
          ? "comment"
          : node.nodeType === Node.CDATA_SECTION_NODE
            ? "cdata"
            : node.nodeType === Node.PROCESSING_INSTRUCTION_NODE
              ? "pi"
              : null;
    if (token.kind !== kind) throw new Mismatch();
    spans.set(node, {
      start: token.start,
      end: token.end,
      tagEnd: token.end,
      closeStart: token.end,
      selfClosing: false,
    });
  };
  visit(root);
  if (index !== tokens.length) throw new Mismatch();
  return spans;
}

function record(changes: Changes, mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    changes.any = true;
    if (mutation.type === "attributes") changes.attributes.add(mutation.target);
    else if (mutation.type === "childList") changes.children.add(mutation.target);
    else changes.data.add(mutation.target);
  }
}

/**
 * Watches a parsed score for changes and keeps where each node was in `text`, the text it was parsed from, with
 * the root element between `start` and `end`. If the text and the tree cannot be matched (a parser that
 * expanded an entity, say), the score is still written correctly, only without keeping the original spelling.
 */
export function trackSource(text: string, root: Element, start: number, end: number): SourceText {
  let spans: WeakMap<Node, Span> | null;
  try {
    spans = assignSpans(root, tokenize(text, start, end));
  } catch (error) {
    if (!(error instanceof Mismatch)) throw error;
    spans = null;
  }
  const changes: Changes = { attributes: new WeakSet(), children: new WeakSet(), data: new WeakSet(), any: false };
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver((mutations) => record(changes, mutations));
    observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
  }
  return { text, spans, changes, observer };
}

/** Whether anything in the tree has changed since it was read. Without a MutationObserver, always true. */
export function hasChanged(source: SourceText): boolean {
  if (!source.observer) return true;
  record(source.changes, source.observer.takeRecords());
  return source.changes.any;
}

/** Stops watching (when the document is replaced, by undo for instance). */
export function stopTracking(source: SourceText) {
  source.observer?.disconnect();
}

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (value: string) =>
  escapeText(value).replace(/"/g, "&quot;").replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");

function startTag(element: Element): string {
  const attributes = Array.from(element.attributes)
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join("");
  return `<${element.nodeName}${attributes}`;
}

/**
 * The root element's text: untouched nodes copied from the text they were read from, changed ones written
 * afresh, new ones serialised.
 */
export function writeSource(source: SourceText, root: Element): string {
  const { spans, text } = source;
  if (!spans || !source.observer) return new XMLSerializer().serializeToString(root);
  const changes = source.changes;
  record(changes, source.observer.takeRecords());
  // Whether a node and everything in it are exactly as read.
  const clean = new Map<Node, boolean>();
  const isClean = (node: Node): boolean => {
    const known = clean.get(node);
    if (known !== undefined) return known;
    let result =
      spans.has(node) && !changes.attributes.has(node) && !changes.children.has(node) && !changes.data.has(node);
    if (result) for (const child of Array.from(node.childNodes)) if (!isClean(child)) result = false;
    clean.set(node, result);
    return result;
  };
  const serializer = new XMLSerializer();
  const write = (node: Node): string => {
    const span = spans.get(node);
    if (!span) return serializer.serializeToString(node);
    if (isClean(node)) return text.slice(span.start, span.end);
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return serializer.serializeToString(node);
    const element = node as Element;
    const children = Array.from(element.childNodes);
    let open: string;
    if (changes.attributes.has(element)) open = startTag(element);
    else if (span.selfClosing) open = text.slice(span.start, span.tagEnd).replace(/\s*\/>$/, "");
    else open = text.slice(span.start, span.tagEnd - 1);
    // An element keeps its form: one written `<a/>` stays so while empty, one written `<a></a>` too.
    const close = span.selfClosing ? null : text.slice(span.closeStart, span.end);
    if (children.length === 0) return close === null ? `${open}/>` : `${open}>${close}`;
    return `${open}>${children.map(write).join("")}${close ?? `</${element.nodeName}>`}`;
  };
  return write(root);
}
