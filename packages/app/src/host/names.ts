/** A file name without its score extension. */
export const stem = (name: string) => name.replace(/\.(musicxml|xml|mxl)$/i, "");

/** The last part of a path, on Windows, macOS or Linux. */
export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** A file with another name in the same folder as `path`. */
export const sibling = (path: string, name: string) => path.replace(/[^\\/]*$/, name);
