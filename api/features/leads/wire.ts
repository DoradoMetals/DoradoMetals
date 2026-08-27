// The shape the frontend expects, built from table rows.
//
// This is the layer that lets the API be restructured without the frontend
// moving. A repo returns its own table's row; this composes whatever the
// browser is currently asking for. When a screen migrates to composing for
// itself, its function here is deleted - per feature, not all at once.
//
// FOR LEADS IT IS AN IDENTITY, and that is worth stating rather than leaving
// the reader to infer it from an absent file. exchange.leads and leads.leads
// carry the same column names, so there is nothing to rename and nothing to
// join. The two columns that differ - created_by_id and updated_by_id, which
// only the new schema has - are excluded by the projection in sql/, so they
// never reach here.
//
// It is still a real function rather than nothing, because the guarantee is
// "the wire shape is decided in exactly one place per feature". A feature whose
// conversion is empty today gets one the moment its tables diverge, and callers
// do not change.
import type { LeadRow } from "#features/leads/repo.ts";

export type LeadWire = LeadRow;

export const toWire = (row: LeadRow): LeadWire => row;

export const listToWire = (rows: LeadRow[]): LeadWire[] => rows.map(toWire);
