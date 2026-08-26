// Dual-read phase of the users schema migration.
//
// This one is shaped differently from every other dual repo in the codebase,
// and the difference is forced rather than chosen.
//
// Everywhere else, our code owns the write, so the dual repo writes exchange
// and then mirrors into the new schema in the same transaction. Here it cannot:
// better-auth is configured with `modelName: 'exchange.users'` and writes
// through its own pg Pool. Signup, profile edits, verification and bans never
// touch a line of our code, so there is nothing to wrap.
//
// So the mirror moved into the database. Migration 056 puts an AFTER INSERT OR
// UPDATE trigger on exchange.users that upserts into auth.users, which sits
// below better-auth's pool and sees every write regardless of who made it.
//
// Which leaves this file with only one job: read from the new schema, and let
// writes go where they already go. adjustUserCredit still writes exchange, and
// the trigger carries it across - writing auth.users here as well would be a
// second mechanism doing the same work, and a chance for the two to disagree.
//
// Gate on `pnpm --filter @dorado/api diff users` before promoting.
import * as exchange from "#features/users/repo.exchange.js";
import * as next from "#features/users/repo.next.ts";

export const getUser = next.getUser;
export const getAllUsers = next.getAllUsers;
export const getAdminUsers = next.getAdminUsers;

// Writes exchange only. The trigger from 056 does the rest.
export const adjustUserCredit = exchange.adjustUserCredit;
