// Old format (9 digits + V/X) and new (12 digits), allowing the spaces
// and dashes people type between groups. Not inside a longer run of
// digits or letters, so phone numbers and references stay readable.
const NIC_PATTERN =
  /(?<![\dA-Za-z])(?:(?:\d[ -]?){8}\d[ -]?[VvXx]|(?:\d[ -]?){11}\d)(?![\dA-Za-z])/g;

export function replaceNics(text: string, replacement: string): string {
  return text.replace(NIC_PATTERN, replacement);
}
