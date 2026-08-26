// media.images calls one column `checksum` where exchange.images calls it
// `checksum_sha256`. A rename and nothing else, so it is a declaration.
//
//   MEDIA_WIRE=legacy  (default) checksum_sha256
//   MEDIA_WIRE=next              checksum
import { makeWireAdapter } from "#shared/wire/rename.ts";

export const { toWire, fromWire, toLegacy, fromLegacy, activeShape } = makeWireAdapter({
  env: "MEDIA_WIRE",
  names: { checksum: "checksum_sha256" },
});
