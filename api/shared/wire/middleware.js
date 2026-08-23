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
const APPLIED = Symbol("wireShape");

export function wireShape(adapter, { body } = {}) {
  return (req, res, next) => {
    if (res[APPLIED]) return next();
    res[APPLIED] = true;

    if (body !== false && adapter.fromWire && req.body && typeof req.body === "object") {
      if (body === undefined) {
        req.body = adapter.fromWire(req.body);
      } else if (req.body[body] !== undefined) {
        req.body = { ...req.body, [body]: adapter.fromWire(req.body[body]) };
      }
    }

    const send = res.json.bind(res);
    res.json = (payload) => send(adapter.toWire(payload));

    next();
  };
}
