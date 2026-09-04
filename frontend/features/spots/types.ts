// Spot types, FROM THE CONTRACTS.
//
// The live feed's shape is `SpotTicker` - the quote plus the SERVER'S answer
// to which way the metal moved today (`direction`). Every ticker used to
// derive that from `dollar_change` for itself.
//
// What used to share this file moved to where its wire lives: the
// order-locked spot rows are the contracts' SpotOnOrder, and the admin metal
// list is `Metal` (GET /metals), read through @dorado/client.
import type { SpotTicker } from "@dorado/contracts";

export type { SpotTicker }

// *** NOT A CONTRACT. *** `metals.name` is plain text; these four names are
// the metals a UI list renders, kept beside the UI that reads it.
export type Metal = "Gold" | "Silver" | "Platinum" | "Palladium";
