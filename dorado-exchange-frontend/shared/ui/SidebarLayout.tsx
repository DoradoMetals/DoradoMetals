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
import { CaretDoubleRightIcon, UserIcon } from '@phosphor-icons/react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

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
  roleIconClassName?: string
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
  roleIconClassName,
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
      className={cn('h-full shrink-0 bg-card p-2 transition-all duration-300 rounded-lg', navClass)}
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
              <div className="flex items-center justify-center p-3 rounded-lg bg-primary shadow-sm">
                {RoleIcon ? (
                  <RoleIcon
                    size={20}
                    className={cn('text-neutral-900', roleIconClassName ?? 'text-white')}
                  />
                ) : (
                  <UserIcon
                    size={20}
                    className={cn('text-neutral-900', roleIconClassName ?? 'text-white')}
                  />
                )}
              </div>

              {isOpen && (
                <div className="leading-tight">
                  {roleTitle && (
                    <div className="text-sm font-semibold text-neutral-900">{roleTitle}</div>
                  )}
                  {roleSubtitle && <div className="text-xs text-neutral-500">{roleSubtitle}</div>}
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
              <div className="p-2 text-xs font-medium text-neutral-400 uppercase tracking-wide">
                {section.label}
              </div>
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
                      : 'text-neutral-800 hover:text-primary',
                    isOpen ? 'justify-start' : 'justify-center'
                  )}
                >
                  <div className="flex h-full items-center justify-center">
                    <item.icon size={20} />
                  </div>

                  {isOpen && <span className="text-base">{item.label}</span>}

                  {isOpen && item.badge != null && item.badge !== '' && (
                    <span className="flex ml-auto h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-white">
                      {item.badge}
                    </span>
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
            className="flex items-center gap-2 my-4 cursor-pointer text-neutral-500 hover:text-neutral-800"
          >
            <CaretDoubleRightIcon
              size={16}
              className={cn('transition-transform', isOpen && 'rotate-180')}
            />
            {isOpen && <span className="text-sm font-medium">Hide</span>}
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
      <main className="flex-1 overflow-auto">{content}</main>
    </div>
  )
}
