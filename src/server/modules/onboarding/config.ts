// BR-ONB-01: the day number in a NIC is the day of the birth year (1–366),
// plus 500 for women.
export const NIC_DAY_RANGES = [
  { min: 1, max: 366 },
  { min: 501, max: 866 },
] as const;

// Old-format NICs carry a two-digit year; every holder was born in the 1900s.
export const OLD_NIC_CENTURY = 1900;

export const KYC_LIMITS = {
  fullName: { min: 2, max: 100 },
  address: { min: 5, max: 200 },
} as const;
