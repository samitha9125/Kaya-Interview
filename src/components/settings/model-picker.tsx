"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";

type PickerModel = { id: string; name: string };

type ModelPickerProps = {
  id: string;
  models: PickerModel[];
  value: string;
  disabled: boolean;
  onChange: (modelId: string) => void;
};

// Searchable, because the catalogue lists every tool-capable model on
// OpenRouter. A select-like button with the search box inside the popup
// (Base UI's "input inside popup"), so the current choice is never edited
// by accident; the list keeps shadcn's height cap and scrolls inside it.
export function ModelPicker({ id, models, value, disabled, onChange }: ModelPickerProps) {
  const items = useMemo(
    () =>
      BaseCombobox.createItems(models, {
        getValue: (model) => model.id,
        getLabel: (model) => model.name,
      }),
    [models],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onValueChange={(modelId) => {
        if (modelId) onChange(modelId);
      }}
      disabled={disabled}
      autoHighlight
    >
      <ComboboxTrigger
        id={id}
        render={<Button variant="outline" className="w-full justify-between font-normal" />}
      >
        <span className="truncate">
          <ComboboxValue />
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder="Search models" aria-label="Search models" />
        <ComboboxEmpty>No model matches that.</ComboboxEmpty>
        <ComboboxList>
          {(model: PickerModel) => (
            <ComboboxItem key={model.id} value={model.id}>
              {model.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
