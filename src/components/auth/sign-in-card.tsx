"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson } from "@/components/api";
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

export function SignInCard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function run(call: () => ReturnType<typeof postJson>) {
    setIsBusy(true);
    setError(null);
    const result = await call();
    setIsBusy(false);
    if (result.ok) router.refresh();
    else setError(result.message);
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() =>
      postJson("/api/auth/login", {
        customerNumber: String(form.get("customerNumber") ?? ""),
        password: String(form.get("password") ?? ""),
      }),
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>Sign in to check a loan, or start opening an account.</CardDescription>
      </CardHeader>
      <form onSubmit={signIn}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customerNumber">Customer number</Label>
            <Input
              id="customerNumber"
              name="customerNumber"
              autoComplete="username"
              placeholder="C1001"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={isBusy}>
            Sign in
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isBusy}
            onClick={() => void run(() => postJson("/api/auth/guest"))}
          >
            I&apos;m new
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
