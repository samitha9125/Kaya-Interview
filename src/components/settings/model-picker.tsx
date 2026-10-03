"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type CatalogModel = {
  id: string;
  name: string;
  contextLength: number;
  inputMicroUsdPerMTok: number;
  outputMicroUsdPerMTok: number;
};
export type RoleChoice = { role: string; modelId: string; isFlagged: boolean };

const ROLE_NAMES: Record<string, string> = {
  triage: "Triage",
  loan: "Loan",
  kyc: "Account opening",
};

const dollars = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(2)}`;
const tokens = (count: number) =>
  count >= 1_000_000 ? `${count / 1_000_000}M` : `${Math.round(count / 1_000)}K`;

export const describeModel = (model: CatalogModel) =>
  `${model.name} · ${dollars(model.inputMicroUsdPerMTok)} in / ${dollars(model.outputMicroUsdPerMTok)} out per 1M tokens · ${tokens(model.contextLength)} context`;

type ModelPickerProps = { choice: RoleChoice; models: CatalogModel[] | null; canChange: boolean };

export function ModelPicker({ choice, models, canChange }: ModelPickerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(choice.modelId);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = ROLE_NAMES[choice.role] ?? choice.role;
  const fieldId = `model-${choice.role}`;
  const current = models?.find((model) => model.id === choice.modelId);

  async function save() {
    setIsBusy(true);
    setStatus(null);
    setError(null);
    const result = await postJson("/api/settings/model", { role: choice.role, modelId: selected });
    setIsBusy(false);
    if (!result.ok) return setError(result.message);
    setStatus("Saved. New conversations use it.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {canChange && models ? (
        <>
          <Label htmlFor={fieldId}>{name} model</Label>
          <div className="flex gap-2">
            <select
              id={fieldId}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={isBusy}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
            >
              {!current && (
                <option value={choice.modelId}>{choice.modelId} (no longer offered)</option>
              )}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {describeModel(model)}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              aria-label={`Save the ${name.toLowerCase()} model`}
              onClick={() => void save()}
              disabled={isBusy || selected === choice.modelId}
            >
              Save
            </Button>
          </div>
        </>
      ) : (
        <p>
          <span className="font-medium">{name} model:</span>{" "}
          {current ? describeModel(current) : choice.modelId}
        </p>
      )}
      {choice.isFlagged && (
        <p role="alert" className="text-sm text-destructive">
          This model is no longer offered with tool support. Choose another one.
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
