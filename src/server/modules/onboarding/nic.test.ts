import { describe, expect, it } from "vitest";
import { parseNic } from "./nic";

// Generated examples, not real people. secret-scan:ignore
describe("onboarding/nic: the two NIC formats (BR-ONB-01)", () => {
  it.each([
    { nic: "851230011V", birthYear: 1985, format: "old, V" },
    { nic: "851230011x", birthYear: 1985, format: "old, lower-case x" },
    { nic: "198512300011", birthYear: 1985, format: "new" },
    { nic: "2001 6230 0011", birthYear: 2001, format: "new, with spaces" },
    { nic: "85-123-0011-V", birthYear: 1985, format: "old, with dashes" },
  ])("BR-ONB-01: $nic ($format) → born $birthYear", ({ nic, birthYear }) => {
    expect(parseNic(nic)).toMatchObject({ ok: true, birthYear });
  });

  it("BR-ONB-01: a NIC is kept in one canonical form: no spaces, upper-case letter", () => {
    expect(parseNic(" 85-123-0011-x ")).toMatchObject({ ok: true, nic: "851230011X" });
  });

  it.each([
    { nic: "85123001V", case: "old, 8 digits" },
    { nic: "8512300111V", case: "old, 10 digits" },
    { nic: "851230011Z", case: "old, wrong letter" },
    { nic: "19851230001", case: "new, 11 digits" },
    { nic: "1985123000111", case: "new, 13 digits" },
    { nic: "19851230001V", case: "new with a letter" },
    { nic: "", case: "empty" },
  ])("BR-ONB-01: $nic ($case) → not a NIC", ({ nic }) => {
    expect(parseNic(nic).ok).toBe(false);
  });

  it.each([
    { nic: "850000011V", day: 0, ok: false },
    { nic: "850010011V", day: 1, ok: true },
    { nic: "853660011V", day: 366, ok: true },
    { nic: "853670011V", day: 367, ok: false },
    { nic: "855000011V", day: 500, ok: false },
    { nic: "855010011V", day: 501, ok: true },
    { nic: "858660011V", day: 866, ok: true },
    { nic: "858670011V", day: 867, ok: false },
    { nic: "198500000011", day: 0, ok: false },
    { nic: "198586600011", day: 866, ok: true },
    { nic: "198586700011", day: 867, ok: false },
  ])("BR-ONB-01: day number $day ($nic) → valid: $ok", ({ nic, ok }) => {
    expect(parseNic(nic).ok).toBe(ok);
  });
});
