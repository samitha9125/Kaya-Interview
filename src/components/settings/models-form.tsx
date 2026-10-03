"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/api";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ModelPicker } from "./model-picker";

export type CatalogModel = {
  id: string;
  name: string;
  contextLength: number;
  inputMicroUsdPerMTok: number;
  outputMicroUsdPerMTok: number;
};
export type RoleChoice = { role: string; modelId: string; isFlagged: boolean };

const ROLES: Record<string, { name: string; job: string }> = {
  triage: { name: "Triage", job: "Routes each message to the right journey." },
  loan: { name: "Loan", job: "Talks customers through loan checks." },
  kyc: { name: "Account opening", job: "Guides customers through opening an account (KYC)." },
};

const dollars = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(2)}`;
// Context sizes are powers of two in practice (1,048,576), shown rounded.
const tokens = (count: number) =>
  count >= 1_000_000 ? `${Math.round(count / 1_000_000)}M` : `${Math.round(count / 1_000)}K`;
const details = (model: CatalogModel) =>
  `${dollars(model.inputMicroUsdPerMTok)} in · ${dollars(model.outputMicroUsdPerMTok)} out per 1M tokens · ${tokens(model.contextLength)} context`;

type ModelsFormProps = { roles: RoleChoice[]; models: CatalogModel[] | null; canChange: boolean };

export function ModelsForm({ roles, models, canChange }: ModelsFormProps) {
  const router = useRouter();
  const saved = Object.fromEntries(roles.map((choice) => [choice.role, choice.modelId]));
  const [selected, setSelected] = useState(saved);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = roles.filter((choice) => selected[choice.role] !== choice.modelId);
  const isEditable = canChange && models !== null;

  async function save() {
    setIsBusy(true);
    setStatus(null);
    setError(null);
    for (const choice of changed) {
      const result = await postJson("/api/settings/model", {
        role: choice.role,
        modelId: selected[choice.role],
      });
      if (!result.ok) {
        setIsBusy(false);
        return setError(result.message);
      }
    }
    setIsBusy(false);
    setStatus("Saved");
    router.refresh();
  }

  return (
    <>
      <ul className="flex flex-col divide-y px-(--card-spacing)">
        {roles.map((choice) => {
          const role = ROLES[choice.role] ?? { name: choice.role, job: "" };
          const fieldId = `model-${choice.role}`;
          const current = models?.find((model) => model.id === selected[choice.role]);
          return (
            <li
              key={choice.role}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={isEditable ? fieldId : undefined}>{role.name}</Label>
                <p className="text-sm text-muted-foreground">{role.job}</p>
              </div>
              <div className="flex flex-col gap-1 sm:w-72 sm:shrink-0">
                {isEditable ? (
                  <ModelPicker
                    id={fieldId}
                    models={
                      models.some((model) => model.id === choice.modelId)
                        ? models
                        : [
                            { id: choice.modelId, name: `${choice.modelId} (no longer offered)` },
                            ...models,
                          ]
                    }
                    value={selected[choice.role] ?? choice.modelId}
                    disabled={isBusy}
                    onChange={(modelId) => {
                      setStatus(null);
                      setSelected({ ...selected, [choice.role]: modelId });
                    }}
                  />
                ) : (
                  <p className="text-sm font-medium">{current?.name ?? choice.modelId}</p>
                )}
                {current && <p className="text-xs text-muted-foreground">{details(current)}</p>}
                {choice.isFlagged && (
                  <p role="alert" className="text-xs text-destructive">
                    No longer offered with tool support. Choose another model.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {isEditable && (
        <CardFooter className="justify-end gap-3">
          {status && (
            <p role="status" className="text-sm text-success">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button onClick={() => void save()} disabled={isBusy || changed.length === 0}>
            Save changes
          </Button>
        </CardFooter>
      )}
    </>
  );
}
