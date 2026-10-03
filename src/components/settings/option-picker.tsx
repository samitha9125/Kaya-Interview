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

type PickerOption = { id: string; name: string };

type OptionPickerProps = {
  id: string;
  options: PickerOption[];
  value: string;
  disabled: boolean;
  onChange: (optionId: string) => void;
  searchLabel: string;
};

// One dropdown for every choice on Settings. A select-like button with the
// search box inside the popup (Base UI's "input inside popup"), so the
// current choice is never edited by accident; the list keeps shadcn's
// height cap and scrolls inside it, which matters for the model catalogue.
// The search box stays even for short lists: the Combobox's keyboard
// navigation runs through it.
export function OptionPicker({
  id,
  options,
  value,
  disabled,
  onChange,
  searchLabel,
}: OptionPickerProps) {
  const items = useMemo(
    () =>
      BaseCombobox.createItems(options, {
        getValue: (option) => option.id,
        getLabel: (option) => option.name,
      }),
    [options],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onValueChange={(optionId) => {
        if (optionId) onChange(optionId);
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
        <ComboboxInput showTrigger={false} placeholder={searchLabel} aria-label={searchLabel} />
        <ComboboxEmpty>Nothing matches that.</ComboboxEmpty>
        <ComboboxList>
          {(option: PickerOption) => (
            <ComboboxItem key={option.id} value={option.id}>
              {option.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
