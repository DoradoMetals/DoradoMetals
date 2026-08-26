// Mints, straight through to the switch.
//
// The return type is named here rather than inferred, because repo.js is
// JavaScript: it picks between the two implementations at runtime, so
// TypeScript sees `any` coming out of it. Declaring MintRow is what carries a
// real type up to the controller.
//
// Taking it from repo.next.ts is safe by the invariant this migration already
// enforces - `diff mints` compares the two implementations row for row, and
// repo.dual switches between them only while they agree.
import * as mintRepo from "#features/mints/repo.js";
import type { MintRow } from "#features/mints/repo.next.ts";

export const getAllMints = (): Promise<MintRow[]> => mintRepo.getAllMints();
