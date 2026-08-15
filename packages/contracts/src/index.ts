// Shared contracts for the Dorado API.
//
// Two layers, deliberately separate:
//
//   generated/  one zod schema per table, produced from information_schema.
//               Column types, nullability and enum values are whatever the
//               database actually says. Never hand-edited.
//
//   wire/       the shapes the API actually returns and accepts, composed from
//               the generated leaves. Where an endpoint nests, renames or omits
//               a column, that happens here and only here.
//
// Form schemas belong to the frontend, not this package: they layer UI
// messages and input coercion on top of a wire schema, and the wire schema
// must stay free of both.
export * from "./generated/tables.js";
export * from "./wire/index.js";
