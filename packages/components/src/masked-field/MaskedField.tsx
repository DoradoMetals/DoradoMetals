'use client'

// Masked Field - the Figma set (170:89, drawn 2026-08-30): Input with a
// FORMAT CONTRACT. The mask formats on input but never blocks paste; the
// EMITTED value is always the raw digits (formatting is presentation);
// inputmode and autocomplete tokens ride each mask. Card numbers are
// display-format only - this app never stores one (Stripe holds them), and
// nothing masked here may ever be logged.
import * as React from "react";

import { Input, type InputProps } from "../input/Input";

export type MaskKind = "phone" | "card" | "expiry" | "amount" | "email";

const FORMAT: Record<MaskKind, (raw: string) => string> = {
  phone(raw) {
    const d = raw.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  },
  card(raw) {
    const d = raw.replace(/\D/g, "").slice(0, 19);
    return d.replace(/(.{4})/g, "$1 ").trim();
  },
  expiry(raw) {
    const d = raw.replace(/\D/g, "").slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)} / ${d.slice(2)}`;
  },
  amount(raw) {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const [int = "", frac] = cleaned.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return frac != null ? `${grouped}.${frac.slice(0, 2)}` : grouped;
  },
  email: (raw) => raw, // masking an email is hostile; inputmode+validation only
};

const STRIP: Record<MaskKind, (formatted: string) => string> = {
  phone: (f) => f.replace(/\D/g, ""),
  card: (f) => f.replace(/\D/g, ""),
  expiry: (f) => f.replace(/\D/g, ""),
  amount: (f) => f.replace(/,/g, ""),
  email: (f) => f,
};

const ATTRS: Record<MaskKind, Partial<InputProps>> = {
  phone: { inputMode: "tel", autoComplete: "tel", placeholder: "(555) 123-4567" },
  card: { inputMode: "numeric", autoComplete: "cc-number", placeholder: "4242 4242 4242 4242" },
  expiry: { inputMode: "numeric", autoComplete: "cc-exp", placeholder: "MM / YY" },
  amount: { inputMode: "decimal", placeholder: "0.00" },
  email: { inputMode: "email", autoComplete: "email", type: "email", placeholder: "you@example.com" },
};

export type MaskedFieldProps = Omit<InputProps, "value" | "onChange" | "type"> & {
  mask: MaskKind;
  /** The RAW value (digits / plain string) - never the formatted one. */
  value: string;
  /** Receives the RAW value. */
  onValueChange: (raw: string) => void;
};

export function MaskedField({ mask, value, onValueChange, ...props }: MaskedFieldProps) {
  return (
    <Input
      {...ATTRS[mask]}
      {...props}
      value={FORMAT[mask](value)}
      onChange={(e) => onValueChange(STRIP[mask](FORMAT[mask](e.target.value)))}
    />
  );
}
