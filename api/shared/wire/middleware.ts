// Applies a feature's wire adapter at the edge, as middleware.
//
// The adapter used to be called by hand in every controller handler -
// `res.json(toWire(result))` - which had three problems. A new endpoint that
// forgot the call leaked the new shape to a frontend expecting the old one.
// Deleting the adapter meant editing every handler rather than removing a line.
// And the controllers knew about the legacy frontend, which is not their
// business: a controller's job is to call the service and answer, not to know
// that somebody downstream has not caught up yet.
//
// Mounted on the router instead, so it wraps every route in the feature at once
// and comes off in one edit:
//
//   router.use(wireShape(carriersWire, { body: "carrier" }));
//
// OUTBOUND is generic: res.json is wrapped, so whatever a handler sends is
// converted on the way out. Adapters guard non-objects, so a handler returning
// `true` or a message string passes through untouched.
//
// INBOUND is not generic, and cannot be. The entity is somewhere inside the
// request body and only the feature knows where - `{ address, user_id }` for
// addresses, `{ carrier }` for carriers, the body itself for others. `body`
// names the key, or is omitted when the body IS the entity, or false when the
// feature has no writes to convert.
// Applying an adapter twice is not harmless. A rename applied twice renames
// nothing the second time, but a reshape does real damage: flatten() on an
// already-flat object finds no nested key, so it sets every field it was meant
// to lift to null. So this is applied at most once per request, whichever route
// or router mounts it first, and a second mount is a no-op rather than a
// corruption.
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { WireData } from "#shared/wire/rename.ts";

// STRUCTURAL, NOT NOMINAL. Four features declare their adapter through
// makeWireAdapter and three write their own, so this cannot depend on the
// helper's return type - it has to accept anything shaped like an adapter.
// `fromWire` is optional because the check below already tolerates its absence.
export interface WireLike {
  toWire: (data: WireData) => WireData;
  fromWire?: (data: WireData) => WireData;
}

export interface WireShapeOptions {
  /**
   * The key in the request body holding the entity, or omitted when the body IS
   * the entity, or false when the feature has no writes to convert.
   */
  body?: string | false;
}

const APPLIED = Symbol("wireShape");

// res is widened rather than augmenting Express's own Response type globally: a
// module-level declaration merge would put this symbol on every response in the
// codebase to serve one middleware.
type Marked = Response & { [APPLIED]?: boolean };

export function wireShape(adapter: WireLike, { body }: WireShapeOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const marked = res as Marked;
    if (marked[APPLIED]) return next();
    marked[APPLIED] = true;

    if (body !== false && adapter.fromWire && req.body && typeof req.body === "object") {
      if (body === undefined) {
        req.body = adapter.fromWire(req.body as WireData);
      } else if ((req.body as Record<string, unknown>)[body] !== undefined) {
        req.body = {
          ...(req.body as Record<string, unknown>),
          [body]: adapter.fromWire((req.body as Record<string, unknown>)[body] as WireData),
        };
      }
    }

    const send = res.json.bind(res);
    res.json = (payload: unknown) => send(adapter.toWire(payload as WireData));

    next();
  };
}
