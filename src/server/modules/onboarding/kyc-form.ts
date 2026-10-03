import { z } from "zod";
import { sriLankaDay } from "@/server/platform/time";
import { KYC_LIMITS } from "./config";
import { parseNic } from "./nic";

// FR-ONB-01: each message is written for the applicant, so the form can
// show it next to the field.
const MESSAGES = {
  fullName: "Please enter your full name as it appears on your NIC.",
  nic: "Please enter a valid NIC: 9 digits and V or X, or 12 digits.",
  nicYear: "The birth year in your NIC doesn't match your date of birth.",
  dateOfBirth: "Please enter your date of birth as YYYY-MM-DD.",
  futureBirth: "Your date of birth can't be in the future.",
  address: "Please enter your home address.",
  mobileNumber: "Please enter a Sri Lankan mobile number, such as 077 123 4567.",
  accountType: "Please choose a savings or current account.",
  form: "Some of those details weren't expected. Please use the form.",
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[\p{L} .'-]+$/u;
// A Sri Lankan mobile number: 07X XXX XXXX, or +94 7X XXX XXXX.
const MOBILE = /^(?:\+94|0)(7\d{8})$/;

const isRealDate = (value: string) =>
  ISO_DATE.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

function formSchema(now: Date) {
  const text = (message: string, { min, max }: { min: number; max: number }) =>
    z.string({ error: message }).trim().min(min, { error: message }).max(max, { error: message });
  return z
    .strictObject(
      {
        fullName: text(MESSAGES.fullName, KYC_LIMITS.fullName).regex(NAME, {
          error: MESSAGES.fullName,
        }),
        nic: z.string({ error: MESSAGES.nic }).transform((value, context) => {
          const parsed = parseNic(value);
          if (parsed.ok) return parsed;
          context.addIssue({ code: "custom", message: MESSAGES.nic });
          return z.NEVER;
        }),
        dateOfBirth: z
          .string({ error: MESSAGES.dateOfBirth })
          .refine(isRealDate, { error: MESSAGES.dateOfBirth })
          .refine((value) => value <= sriLankaDay(now), { error: MESSAGES.futureBirth }),
        address: text(MESSAGES.address, KYC_LIMITS.address),
        mobileNumber: z
          .string({ error: MESSAGES.mobileNumber })
          .transform((value) => value.replace(/[\s-]/g, ""))
          .pipe(z.string().regex(MOBILE, { error: MESSAGES.mobileNumber }))
          .transform((value) => `0${MOBILE.exec(value)?.[1] ?? ""}`),
        accountType: z.enum(["savings", "current"], { error: MESSAGES.accountType }),
      },
      { error: MESSAGES.form },
    )
    .refine((form) => form.nic.birthYear === Number(form.dateOfBirth.slice(0, 4)), {
      path: ["nic"],
      error: MESSAGES.nicYear,
      // Compared only once both fields are valid on their own, so each
      // problem gets one message.
      when: ({ issues }) =>
        !issues.some((issue) => ["nic", "dateOfBirth"].includes(String(issue.path?.[0]))),
    })
    .transform((form) => ({ ...form, nic: form.nic.nic }));
}

export type KycForm = z.infer<ReturnType<typeof formSchema>>;
export type KycFormErrors = Partial<Record<keyof KycForm | "form", string>>;
export type KycFormResult = { ok: true; form: KycForm } | { ok: false; errors: KycFormErrors };

// The first problem with each field, keyed by field, for the form to show.
export function parseKycForm(input: unknown, now: Date): KycFormResult {
  const parsed = formSchema(now).safeParse(input);
  if (parsed.success) return { ok: true, form: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] === undefined ? "form" : String(issue.path[0]);
    errors[field] ??= issue.message;
  }
  return { ok: false, errors: errors as KycFormErrors };
}
