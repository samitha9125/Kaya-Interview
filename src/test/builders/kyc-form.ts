// A valid KYC form; tests change one field at a time. Generated details,
// not a real person. secret-scan:ignore
export function aKycForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: "Kasun Perera",
    nic: "199512345678",
    dateOfBirth: "1995-05-03",
    address: "12 Temple Road, Kandy",
    mobileNumber: "077 123 4567",
    accountType: "savings",
    ...overrides,
  };
}
