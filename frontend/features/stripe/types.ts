// SEVENTH CONVERTED FEATURE (2026-08-27), types FROM THE CONTRACTS - and the
// LAST *_WIRE adapter's consumer. PaymentIntent used to be hand-written with
// the LEGACY field names: exchange's one flat row per Stripe intent, in CENTS,
// with the instrument inline. It is now the nested shape both API repos
// return - what was asked for at the top, what was tried on `attempt`
// (carrying the provider's reference), the instrument on `details` - imported
// from @dorado/contracts so `tsc` sees a rename from both sides.
//
// TWO THINGS THE OLD TYPE CARRIED THAT THIS ONE MUST NOT GROW BACK:
//   - CENTS. Amounts are DOLLARS on this wire; the adapter that multiplied
//     them back down died with the conversion, and so did every /100 in the
//     components reading it.
//   - `routing`. A customer's bank routing number, on the wire only because
//     the exchange read was SELECT *. It is gone permanently - never SELECT,
//     log, or return bank details.
import type { PaymentIntentWireNext } from '@dorado/contracts'

export type PaymentIntent = PaymentIntentWireNext
