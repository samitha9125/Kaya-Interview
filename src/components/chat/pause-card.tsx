"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KycConfirmCard, KycFormCard } from "./kyc-cards";
import type { Pause } from "./turn-client";
import type { Answer } from "./use-chat";

type PauseCardProps = {
  pause: Pause;
  isBusy: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  onAnswer: (answer: Answer) => Promise<void>;
};

const lkr = (amount: number) => `LKR ${amount.toLocaleString("en-US")}`;
const termsOf = (pause: { amountLkr: number; termMonths: number }) =>
  `${lkr(pause.amountLkr)} over ${pause.termMonths} months`;

// FR-AGT-06: what the customer does here goes to the bank's server, which
// verifies or records it; the assistant only learns the outcome.
export function PauseCard({ pause, isBusy, error, fieldErrors, onAnswer }: PauseCardProps) {
  return (
    <Card aria-labelledby="pause-title" className="w-full">
      {pause.kind === "step_up" && <StepUp isBusy={isBusy} onAnswer={onAnswer} />}
      {pause.kind === "consent" && (
        <Choice
          title="Your consent for a credit check"
          description={`To check a loan of ${termsOf(pause)}, we'll ask the government credit bureau for your credit record. We keep a record of your consent.`}
          accept="I agree"
          decline="No thanks"
          isBusy={isBusy}
          onChoose={(agree) => onAnswer({ kind: "consent", agree })}
        />
      )}
      {pause.kind === "confirm" && (
        <Choice
          title="Submit your application"
          description={`A personal loan of ${termsOf(pause)}.`}
          accept="Submit application"
          decline="Not now"
          isBusy={isBusy}
          onChoose={(confirm) => onAnswer({ kind: "confirm", confirm })}
        />
      )}
      {pause.kind === "kyc_form" && (
        <KycFormCard isBusy={isBusy} onAnswer={onAnswer} fieldErrors={fieldErrors} />
      )}
      {pause.kind === "kyc_confirm" && (
        <KycConfirmCard isBusy={isBusy} onAnswer={onAnswer} details={pause.details} />
      )}
      {error && (
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function StepUp({ isBusy, onAnswer }: Pick<PauseCardProps, "isBusy" | "onAnswer">) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = password;
    setPassword("");
    await onAnswer({ kind: "step_up", password: typed });
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <CardHeader>
        <CardTitle>
          <h2 id="pause-title">Confirm it&apos;s you</h2>
        </CardTitle>
        <CardDescription>
          Please re-enter your password. It goes straight to the bank, not to the assistant.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4 flex flex-col gap-2">
        <Label htmlFor="step-up-password">Password</Label>
        <Input
          id="step-up-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          required
        />
      </CardContent>
      <CardFooter className="mt-4">
        <Button type="submit" disabled={isBusy}>
          Continue
        </Button>
      </CardFooter>
    </form>
  );
}

type ChoiceProps = {
  title: string;
  description: string;
  accept: string;
  decline: string;
  isBusy: boolean;
  onChoose: (accepted: boolean) => Promise<void>;
};

function Choice({ title, description, accept, decline, isBusy, onChoose }: ChoiceProps) {
  return (
    <>
      <CardHeader>
        <CardTitle>
          <h2 id="pause-title">{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="mt-4 flex gap-2">
        <Button autoFocus disabled={isBusy} onClick={() => void onChoose(true)}>
          {accept}
        </Button>
        <Button variant="outline" disabled={isBusy} onClick={() => void onChoose(false)}>
          {decline}
        </Button>
      </CardFooter>
    </>
  );
}
