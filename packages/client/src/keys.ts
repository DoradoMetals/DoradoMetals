// THE QUERY-KEY TABLE, AFTER THE NUKE (ruling 99).
//
// One namespace per resource, and every resource but `auth` is deleted along
// with the surface that read it. The table is not a registry of what the API
// can answer - it is a registry of what this app currently caches - so a key
// for a hook that no longer exists is a claim nothing backs. Each namespace
// comes back with its resource module, in the pass that builds the screen.
export const keys = {
  auth: {
    all: () => ['auth'] as const,
    session: () => ['auth', 'session'] as const,
  },
} as const
