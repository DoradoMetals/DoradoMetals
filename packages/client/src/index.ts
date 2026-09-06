// WHAT IS LEFT OF THE CLIENT PACKAGE (the frontend nuke, ruling 99).
//
// This exported twenty-one resource modules - orders, checkout, payments,
// users, fulfillments, shipping, products, spots, rates, addresses, refiners,
// leads, reviews, media, pdfs, quotes - one per surface. Every one of those
// surfaces is deleted, so every one of those modules is deleted with it. They
// regrow one at a time as the screens are built, which is the point: a hook
// with no caller is a hook nobody has checked against the route it names.
//
// The package itself STAYS, with TanStack Query under it. It is the mutation
// and invalidation layer, and the admin screens will need it on day one; the
// four files below are what the auth surface uses and what any new resource
// module builds on - the fetcher, the query-key table, the session bridge and
// the cache handle.
export * from './fetch'
export * from './keys'
export * from './session'
export * from './cache'
export * from './auth'
