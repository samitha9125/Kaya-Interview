"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, type CardProps } from "./kyc-cards";

// FR-AGT-14: a guest's name and number go to the bank's server for the
// team to call back; the assistant never sees them.
export function CallbackFormCard({
  isBusy,
  onAnswer,
  fieldErrors,
}: CardProps & { fieldErrors: Record<string, string> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contact = Object.fromEntries(
      [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]),
    );
    void onAnswer({ kind: "callback_form", contact });
  }

  return (
    <form onSubmit={submit} noValidate>
      <CardHeader>
        <CardTitle>
          <h2 id="pause-title">Ask for a call</h2>
        </CardTitle>
        <CardDescription>
          Our team will call you within 1 business day. Your details go straight to the bank.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4 flex flex-col gap-4">
        <Field
          name="name"
          label="Your name"
          autoComplete="name"
          autoFocus
          error={fieldErrors.name}
        />
        <Field
          name="mobileNumber"
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          error={fieldErrors.mobileNumber}
        />
      </CardContent>
      <CardFooter className="mt-4 flex gap-2">
        <Button type="submit" disabled={isBusy}>
          Ask for a call
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={() => void onAnswer({ kind: "callback_form", contact: null })}
        >
          Not now
        </Button>
      </CardFooter>
    </form>
  );
}
