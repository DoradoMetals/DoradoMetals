// THE CLIENT PACKAGE.
//
// The mutation and invalidation layer between the app and the API, typed only
// from `@dorado/contracts`. Four substrate files - the fetcher, the query-key
// table, the session bridge and the cache handle - plus one module per
// resource. A module exists only while a surface reads it: a hook with no
// caller is a hook nobody has checked against the route it names.
export * from './fetch'
export * from './keys'
export * from './session'
export * from './cache'
export * from './auth'
export * from './orders'
export * from './refining'
export * from './payments'
export * from './fulfillments'
export * from './shipping'
export * from './spots'
export * from './users'
export * from './crm'
