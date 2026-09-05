'use client'

import * as React from "react";
import { cn } from "../cn";
import { fieldOption, fieldPanel, fieldTrigger, FieldLabel } from "../field/Field";

export type AutocompleteItem = {
  id: string;
  textValue: string;
  label?: React.ReactNode;
};

export type AutocompleteProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: AutocompleteItem[];
  onSelect: (item: AutocompleteItem) => void;
  label?: React.ReactNode;
  placeholder?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  empty?: React.ReactNode;
  className?: string;
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "role" | "aria-expanded" | "aria-controls" | "aria-activedescendant"
  >;
};

export function Autocomplete({
  value,
  onValueChange,
  items,
  onSelect,
  label,
  placeholder,
  leading,
  trailing,
  disabled = false,
  empty,
  className,
  inputProps,
}: AutocompleteProps) {
  const id = React.useId();
  const listId = `${id}-listbox`;
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => setActive(0), [items]);

  const showPanel = open && !disabled && (items.length > 0 || (empty != null && value.length > 0));

  const select = (item: AutocompleteItem) => {
    onSelect(item);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && showPanel && items[active]) {
      e.preventDefault();
      select(items[active]);
      return;
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className={cn("relative flex w-full flex-col gap-0.5", className)}>
      {label != null && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <div data-disabled={disabled || undefined} className={fieldTrigger()}>
        {leading != null && <span className="shrink-0 text-muted-foreground">{leading}</span>}
        <input
          id={id}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && items[active] ? `${id}-opt-${items[active].id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            inputProps?.onFocus?.(e);
          }}
          onBlur={(e) => {
            setOpen(false);
            inputProps?.onBlur?.(e);
          }}
          onKeyDown={(e) => {
            onKeyDown(e);
            inputProps?.onKeyDown?.(e);
          }}
          className="min-w-0 flex-1 bg-transparent text-h5 text-foreground outline-none placeholder:text-placeholder disabled:text-foreground-disabled"
          {...(({ onFocus: _f, onBlur: _b, onKeyDown: _k, ...rest }) => rest)(inputProps ?? {})}
        />
        {trailing != null && <span className="shrink-0">{trailing}</span>}
      </div>
      {showPanel && (
        <ul
          id={listId}
          role="listbox"
          className={cn(fieldPanel(), "absolute top-full mt-1 w-full")}
        >
          {items.length === 0 ? (
            <li className="flex h-9 items-center px-3 text-h5 text-muted-foreground">{empty}</li>
          ) : (
            items.map((item, idx) => (
              <li
                key={item.id}
                id={`${id}-opt-${item.id}`}
                role="option"
                aria-selected={idx === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(item)}
                onMouseEnter={() => setActive(idx)}
                data-highlighted={idx === active || undefined}
                className={fieldOption()}
              >
                {item.label ?? item.textValue}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
