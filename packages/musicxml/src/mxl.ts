import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

import { MusicXmlError } from "./errors";

/** The media type of compressed MusicXML (`.mxl`), and of the score inside its archive. */
export const MXL_MEDIA_TYPE = "application/vnd.recordare.musicxml";
const ROOT_MEDIA_TYPE = "application/vnd.recordare.musicxml+xml";
const CONTAINER_PATH = "META-INF/container.xml";

/** A compressed MusicXML archive as read: every file in it, in its order, and which one is the score. */
export type MxlArchive = {
  /** Each file's path and bytes, as they were in the archive. */
  files: { path: string; bytes: Uint8Array }[];
  /** The path of the score the container names first. */
  rootPath: string;
};

/** Whether the bytes are a zip archive (`PK\x03\x04`), as a `.mxl` file is. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** The first `<rootfile>` that is a score: with the MusicXML media type, or with none (MusicXML 1 and 2). */
function rootPathOf(container: string): string | null {
  const document = new DOMParser().parseFromString(container, "application/xml");
  for (const rootfile of Array.from(document.getElementsByTagName("rootfile"))) {
    const mediaType = rootfile.getAttribute("media-type");
    const path = rootfile.getAttribute("full-path");
    if (path && (mediaType === null || mediaType === ROOT_MEDIA_TYPE)) return path;
  }
  return null;
}

/** Reads a `.mxl` archive: its files, and the score's path from `META-INF/container.xml`. */
export function readMxl(bytes: Uint8Array): MxlArchive {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (cause) {
    throw new MusicXmlError("mxl_not_zip", { detail: cause instanceof Error ? cause.message : String(cause) });
  }
  const container = entries[CONTAINER_PATH];
  const rootPath = container ? rootPathOf(strFromU8(container)) : null;
  if (!rootPath) throw new MusicXmlError("mxl_no_root_file");
  if (!entries[rootPath]) throw new MusicXmlError("mxl_missing_file", { path: rootPath });
  return { files: Object.entries(entries).map(([path, content]) => ({ path, bytes: content })), rootPath };
}

/** The bytes of the archive's score. */
export function rootFileOf(archive: MxlArchive): Uint8Array {
  return archive.files.find((file) => file.path === archive.rootPath)!.bytes;
}

/**
 * The archive written again with the score replaced and every other file as it was. The `mimetype` file
 * comes first and is stored uncompressed, as the MusicXML specification asks; one is added if missing.
 */
export function writeMxl(archive: MxlArchive, score: Uint8Array): Uint8Array {
  const files: Zippable = {};
  const mimetype = archive.files.find((file) => file.path === "mimetype")?.bytes ?? strToU8(MXL_MEDIA_TYPE);
  files.mimetype = [mimetype, { level: 0 }];
  for (const file of archive.files) {
    if (file.path === "mimetype") continue;
    files[file.path] = file.path === archive.rootPath ? score : file.bytes;
  }
  return zipSync(files, { level: 6 });
}

/** A new archive holding one score, with its container and `mimetype`. */
export function newMxl(scorePath: string): MxlArchive {
  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="${scorePath}" media-type="${ROOT_MEDIA_TYPE}"/>
  </rootfiles>
</container>
`;
  return {
    files: [
      { path: "mimetype", bytes: strToU8(MXL_MEDIA_TYPE) },
      { path: CONTAINER_PATH, bytes: strToU8(container) },
      { path: scorePath, bytes: new Uint8Array() },
    ],
    rootPath: scorePath,
  };
}
