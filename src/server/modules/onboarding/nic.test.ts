import { describe, expect, it } from "vitest";
import { parseNic } from "./nic";

// Generated examples, not real people. secret-scan:ignore
describe("onboarding/nic: the two NIC formats (BR-ONB-01)", () => {
  it.each([
    { nic: "851230011V", birthYear: 1985, format: "old, V" },
    { nic: "198512300011", birthYear: 1985, format: "new" },
  ])("BR-ONB-01: $nic ($format) → born $birthYear", ({ nic, birthYear }) => {
    expect(parseNic(nic)).toMatchObject({ ok: true, birthYear });
  });

  it.each([
    { nic: "85123001V", case: "old, 8 digits" },
    { nic: "19851230001", case: "new, 11 digits" },
  ])("BR-ONB-01: $nic ($case) → not a NIC", ({ nic }) => {
    expect(parseNic(nic).ok).toBe(false);
  });

  it.each([
    { nic: "853660011V", day: 366, ok: true },
    { nic: "853670011V", day: 367, ok: false },
    { nic: "855000011V", day: 500, ok: false },
    { nic: "855010011V", day: 501, ok: true },
  ])("BR-ONB-01: day number $day ($nic) → valid: $ok", ({ nic, ok }) => {
    expect(parseNic(nic).ok).toBe(ok);
  });
});
