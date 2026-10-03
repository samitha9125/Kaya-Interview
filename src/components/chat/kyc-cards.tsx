"use client";

import type { ComponentProps, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KycDetails } from "./turn-client";
import type { Answer } from "./use-chat";

type CardProps = { isBusy: boolean; onAnswer: (answer: Answer) => Promise<void> };

type FieldProps = ComponentProps<typeof Input> & { name: string; label: string; error?: string };

// Each field's message sits under it and is announced with it (FR-WEB-07).
function Field({ name, label, error, ...input }: FieldProps) {
  const id = `kyc-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// FR-ONB-01: the details go to the bank's server, which checks them; the
// assistant never sees them (BR-ONB-03).
export function KycFormCard({
  isBusy,
  onAnswer,
  fieldErrors,
}: CardProps & { fieldErrors: Record<string, string> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(
      [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]),
    );
    void onAnswer({ kind: "kyc_form", form });
  }

  return (
    <form onSubmit={submit} noValidate>
      <CardHeader>
        <CardTitle>
          <h2 id="pause-title">Your details</h2>
        </CardTitle>
        <CardDescription>
          These go straight to the bank, not to the assistant. You&apos;ll finish at a branch with
          your original NIC.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4 flex flex-col gap-4">
        <Field
          name="fullName"
          label="Full name"
          autoComplete="name"
          autoFocus
          error={fieldErrors.fullName}
        />
        <Field name="nic" label="NIC number" autoComplete="off" error={fieldErrors.nic} />
        <Field
          name="dateOfBirth"
          label="Date of birth"
          type="date"
          autoComplete="bday"
          error={fieldErrors.dateOfBirth}
        />
        <Field
          name="address"
          label="Home address"
          autoComplete="street-address"
          error={fieldErrors.address}
        />
        <Field
          name="mobileNumber"
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          error={fieldErrors.mobileNumber}
        />
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={fieldErrors.accountType ? "kyc-accountType-error" : undefined}
        >
          <legend className="mb-2 text-sm font-medium">Account type</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="accountType" value="savings" defaultChecked /> Savings
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="accountType" value="current" /> Current
          </label>
          {fieldErrors.accountType && (
            <p id="kyc-accountType-error" className="text-sm text-destructive">
              {fieldErrors.accountType}
            </p>
          )}
        </fieldset>
      </CardContent>
      <CardFooter className="mt-4 flex gap-2">
        <Button type="submit" disabled={isBusy}>
          Continue
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={() => void onAnswer({ kind: "kyc_form", form: null })}
        >
          Not now
        </Button>
      </CardFooter>
    </form>
  );
}

const SUMMARY: { key: keyof KycDetails; label: string }[] = [
  { key: "fullName", label: "Full name" },
  { key: "nic", label: "NIC number" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "address", label: "Home address" },
  { key: "mobileNumber", label: "Mobile number" },
  { key: "accountType", label: "Account type" },
];

// The applicant checks what the bank stored before it's sent.
export function KycConfirmCard({
  isBusy,
  onAnswer,
  details,
}: CardProps & { details: KycDetails | null | undefined }) {
  return (
    <>
      <CardHeader>
        <CardTitle>
          <h2 id="pause-title">Send your application</h2>
        </CardTitle>
        <CardDescription>Please check your details.</CardDescription>
      </CardHeader>
      {details && (
        <CardContent className="mt-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {SUMMARY.map(({ key, label }) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{details[key]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      )}
      <CardFooter className="mt-4 flex gap-2">
        <Button
          autoFocus
          disabled={isBusy}
          onClick={() => void onAnswer({ kind: "kyc_confirm", confirm: true })}
        >
          Send application
        </Button>
        <Button
          variant="outline"
          disabled={isBusy}
          onClick={() => void onAnswer({ kind: "kyc_confirm", confirm: false })}
        >
          Not now
        </Button>
      </CardFooter>
    </>
  );
}
