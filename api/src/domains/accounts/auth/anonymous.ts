import { reportError } from '#shared/observability/report.ts'

export const ROLE_DEFAULT = 'user'

export function fillMissingRole<T extends Record<string, unknown>>(
  user: T
): { data: T & { role: string } } | undefined {
  if (user.role) return undefined
  return { data: { ...user, role: ROLE_DEFAULT } }
}

export function withoutAnonymousCustomers<P extends object>(plugin: P): P {
  const source = plugin as { id?: string; init?: (ctx: never) => unknown }
  const original = source.init
  if (typeof original !== 'function') {
    reportError({
      at: 'auth.withoutAnonymousCustomers',
      message:
        `the ${source.id ?? 'wrapped'} plugin has no init(), so its user-create ` +
        'hook could not be wrapped: an anonymous visitor may now become a ' +
        'Stripe customer on their first basket touch',
    })
    return plugin
  }

  const wrapped = {
    ...plugin,
    init(ctx: never): unknown {
      const result = original.call(plugin, ctx) as
        | {
            options?: {
              databaseHooks?: {
                user?: {
                  create?: { after?: (user: { isAnonymous?: unknown }, ctx: never) => unknown }
                }
              }
            }
          }
        | undefined
        | void
      const create = result?.options?.databaseHooks?.user?.create
      const after = create?.after
      if (!create || typeof after !== 'function') {
        reportError({
          at: 'auth.withoutAnonymousCustomers',
          message:
            `the ${source.id ?? 'wrapped'} plugin no longer registers a ` +
            'databaseHooks.user.create.after hook. Nothing was wrapped, and an ' +
            'anonymous visitor may now become a Stripe customer',
        })
        return result
      }
      create.after = (user, hookCtx) => (user?.isAnonymous ? undefined : after(user, hookCtx))
      return result
    },
  }
  return wrapped as unknown as P
}
