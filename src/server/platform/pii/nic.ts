// Old format (9 digits + V/X) and new (12 digits), allowing the spaces
// and dashes people type between groups. Not inside a longer run of
// digits or letters, so phone numbers and references stay readable.
const NIC_PATTERN =
  /(?<![\dA-Za-z])(?:(?:\d[ -]?){8}\d[ -]?[VvXx]|(?:\d[ -]?){11}\d)(?![\dA-Za-z])/g;

export function replaceNics(text: string, replacement: string): string {
  return text.replace(NIC_PATTERN, replacement);
}

export type NicMatch = { text: string; start: number; end: number };

// The same pattern as replaceNics, as positions: the shape LangChain's
// PII middleware takes from a custom detector (FR-AGT-09).
export function findNics(text: string): NicMatch[] {
  return [...text.matchAll(NIC_PATTERN)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}
