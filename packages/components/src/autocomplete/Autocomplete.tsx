'use client'

// Autocomplete - the drawing at 100:29: "Text field with a suggestion popover -
// for address lookup and any typeahead. Open drops a Suggestions panel on
// surface/popover, separated by border rather than shadow, with Select Option
// rows inside. The first row is shown hovered to indicate the keyboard-
// highlighted result."
//
// The anatomy is the drawing's: Small/Medium label at muted-foreground, an
// h-11 card box with a leading-icon slot and Body value, the panel on
// --popover with p-2 and h-9 rounded-sm rows - highlight fills with accent
// exactly as Select Option says ("the de-hued raised surface").
//
// The semantics are the COMBOBOX PATTERN, which no drawing can express:
// role=combobox with aria-expanded/aria-controls/aria-activedescendant,
// a listbox of role=option rows, ArrowUp/Down moving the highlight, Enter
// selecting it, Escape closing, and mousedown-preventDefault on options so a
// click lands before blur closes the panel. The highlight is aria-
// activedescendant rather than roving focus - focus never leaves the input,
// which is what lets the user keep typing.
//
// CONTROLLED where it matters, internal where it does not: the caller owns
// `value` and `items` (fetching, debouncing and parsing are the caller's
// business - Google Places, a metals list, anything); open state and the
// highlight are this component's.
import * as React from "react";
import { cn } from "../cn";
import { fieldOption, fieldPanel, fieldTrigger, FieldLabel } from "../field/Field";

export type AutocompleteItem = {
  id: string;
  /** What selection means to the machine (fills the input, read to a11y). */
  textValue: string;
  /** What the row shows - defaults to textValue; any node for two-line rows. */
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
  /** Right edge of the box - a clear button, a spinner. */
  trailing?: React.ReactNode;
  disabled?: boolean;
  /** Shown in the panel when open with zero items and a non-empty value. */
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

  // New results restart the highlight at the top - the drawing's "first row is
  // shown hovered".
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
      {/* The FIELD CHASSIS (Popover Field, 106:213): one set of clothes shared
          with Select and the pickers - see field.tsx. */}
      <div className={cn(fieldTrigger(), disabled && "pointer-events-none opacity-50")}>
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
          // The caller's handlers COMPOSE with the internal ones - a spread
          // after ours would let inputProps.onFocus silently replace the
          // open/close machinery, which is exactly how this bug ships.
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
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
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
            <li className="flex h-9 items-center px-3 text-body text-muted-foreground">{empty}</li>
          ) : (
            items.map((item, idx) => (
              <li
                key={item.id}
                id={`${id}-opt-${item.id}`}
                role="option"
                aria-selected={idx === active}
                // Mousedown fires before the input's blur; preventing it is
                // what lets the click land while the panel is still open.
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
