'use client'

import {
  ComponentType,
  ReactNode,
  SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { cn } from '@/shared/utils/cn'
import { ChevronsRight, User } from '@dorado/icons'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import CountBadge from '@/shared/ui/CountBadge'

export type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

export type SidebarItem = {
  key: string
  label: string
  icon: Icon
  badge?: number | string
}

export type SidebarSection = {
  label?: string
  items: SidebarItem[]
}

export type SidebarLayoutProps = {
  sections: SidebarSection[]
  selectedKey: string
  onSelect: (key: string) => void
  content?: ReactNode

  headerEnabled?: boolean
  footerEnabled?: boolean

  roleIcon?: Icon
  roleTitle?: string
  roleSubtitle?: string

  navOnly?: boolean
  forcedOpen?: boolean
  onItemSelectedExtra?: () => void

  defaultOpen?: boolean
  className?: string
  navClass?: string
}

export function useSidebarQueryParamSelection(
  sections: SidebarSection[],
  options?: {
    paramKey?: string
    defaultKey?: string
  }
) {
  const { paramKey = 'tab', defaultKey } = options ?? {}

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const allKeys = useMemo(() => sections.flatMap((s) => s.items.map((i) => i.key)), [sections])

  const queryValue = searchParams.get(paramKey)

  const initialKey = useMemo(() => {
    if (queryValue && allKeys.includes(queryValue)) return queryValue
    if (defaultKey && allKeys.includes(defaultKey)) return defaultKey
    return allKeys[0] ?? ''
  }, [queryValue, allKeys, defaultKey])

  const [selectedKey, setSelectedKey] = useState(initialKey)

  useEffect(() => {
    if (queryValue && allKeys.includes(queryValue) && queryValue !== selectedKey) {
      setSelectedKey(queryValue)
    }
  }, [queryValue, allKeys, selectedKey])

  const handleSelect = useCallback(
    (key: string) => {
      setSelectedKey(key)

      const params = new URLSearchParams(searchParams.toString())
      params.set(paramKey, key)

      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, paramKey]
  )

  return { selectedKey, handleSelect }
}

export function SidebarLayout({
  sections,
  selectedKey,
  onSelect,
  content,
  headerEnabled = true,
  footerEnabled = true,
  roleIcon: RoleIcon,
  roleTitle,
  roleSubtitle,
  navOnly = false,
  forcedOpen,
  onItemSelectedExtra,
  defaultOpen = true,
  className,
  navClass,
}: SidebarLayoutProps) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = forcedOpen ?? open
  const Nav = (
    <nav
      className={cn('max-h-[75vh] overflow-y-auto shrink-0 bg-card p-2 transition-all duration-300 rounded-lg custom-scrollbar', navClass)}
    >
      {headerEnabled && (
        <div className="mb-6 border-b-1 border-border pb-4">
          <div
            className={cn(
              'flex items-center rounded-md p-2 w-full',
              isOpen ? 'justify-between' : 'justify-center'
            )}
          >
            <div className={cn('flex items-center justify-center', isOpen ? 'gap-3' : 'gap-0')}>
              {/* D95 — WHITE ICON ON A WHITE TILE, and the audit could not see it.
                  `--primary` is white now, and the icons resolved to `text-white`
                  through the cn() below: the fallback won because no caller passes
                  `roleIconClassName`, so the pair was a DEFAULT, not a call site.
                  Neither the line-based grep (`bg-primary` and `text-white` were on
                  different lines) nor base.css's compound `.bg-primary.text-white`
                  bridge (different ELEMENTS) reached it.

                  Fixed by the program's own mechanical rule — on `bg-primary` the
                  text token is `--primary-foreground`, never `text-white` — and the
                  `roleIconClassName` escape hatch is gone: it was appearance passed
                  as a prop (ruling 20) and no call site used it. `shadow-sm` went
                  with it (ruling 16 deletes the shadow family). */}
              <div className="flex items-center justify-center p-3 rounded-lg bg-primary">
                {RoleIcon ? (
                  <RoleIcon size={20} className="text-primary-foreground" />
                ) : (
                  <User size={20} className="text-primary-foreground" />
                )}
              </div>

              {isOpen && (
                <div className="leading-tight">
                  {/* Semantic tags carry the type (ruling 17/23): <strong> is
                      already --foreground at weight 600, <small> is already
                      13px muted. Both were hand-spelling what the tag does. */}
                  {roleTitle && <strong className="block">{roleTitle}</strong>}
                  {roleSubtitle && <small className="block">{roleSubtitle}</small>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {sections.map((section, si) => (
          <div key={si} className="space-y-1">
            {isOpen && section.label ? (
              <div className="eyebrow p-2">{section.label}</div>
            ) : null}

            {section.items.map((item) => {
              const isSelected = item.key === selectedKey
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelect(item.key)
                    onItemSelectedExtra?.()
                  }}
                  className={cn(
                    'flex p-2 w-full items-center rounded-md transition-colors gap-3 cursor-pointer',
                    isSelected
                      ? 'text-primary border-l-3 border-primary'
                      : 'text-foreground hover:text-primary',
                    isOpen ? 'justify-start' : 'justify-center'
                  )}
                >
                  <div className="flex h-full items-center justify-center">
                    <item.icon size={20} />
                  </div>

                  {isOpen && <span>{item.label}</span>}

                  {isOpen && item.badge != null && item.badge !== '' && (
                    <CountBadge className="ml-auto">{item.badge}</CountBadge>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {footerEnabled && forcedOpen !== true && (
        <div className="flex justify-center items-center border-t border-border mt-6 w-full">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 my-4 cursor-pointer text-placeholder hover:text-foreground"
          >
            <ChevronsRight
              size={16}
              className={cn('transition-transform', isOpen && 'rotate-180')}
            />
            {isOpen && <small>Hide</small>}
          </button>
        </div>
      )}
    </nav>
  )

  if (navOnly) {
    return <div className={cn('h-full', className)}>{Nav}</div>
  }

  return (
    <div className={cn('flex h-full w-full items-start justify-start gap-6 py-6', className)}>
      <div className="hidden md:block">{Nav}</div>
      <main className="flex-1 min-w-0">{content}</main>
    </div>
  )
}
