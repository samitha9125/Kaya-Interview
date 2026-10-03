import { NIC_DAY_RANGES, OLD_NIC_CENTURY } from "./config";

export type ParsedNic = { ok: true; nic: string; birthYear: number } | { ok: false };

const OLD_FORMAT = /^(\d{2})(\d{3})\d{4}[VX]$/;
const NEW_FORMAT = /^(\d{4})(\d{3})\d{5}$/;

const isValidDay = (day: number) =>
  NIC_DAY_RANGES.some((range) => day >= range.min && day <= range.max);

// BR-ONB-01: old format is 9 digits and V or X (two-digit year); new format
// is 12 digits (four-digit year). Spaces and dashes are allowed, as people
// write them.
export function parseNic(value: string): ParsedNic {
  const nic = value.replace(/[\s-]/g, "").toUpperCase();
  const old = OLD_FORMAT.exec(nic);
  const modern = NEW_FORMAT.exec(nic);
  const match = old ?? modern;
  if (!match?.[1] || !match[2] || !isValidDay(Number(match[2]))) return { ok: false };
  const year = Number(match[1]);
  return { ok: true, nic, birthYear: old ? OLD_NIC_CENTURY + year : year };
}
