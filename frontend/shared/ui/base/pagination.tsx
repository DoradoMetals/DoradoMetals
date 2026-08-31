import * as React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

import { cn } from '@/shared/utils/cn'
import { ButtonProps, buttonVariants } from '@dorado/components'

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn('mx-auto flex w-full justify-center', className)}
    {...props}
  />
)
Pagination.displayName = 'Pagination'

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
  )
)
PaginationContent.displayName = 'PaginationContent'

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn('', className)} {...props} />
)
PaginationItem.displayName = 'PaginationItem'

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<ButtonProps, 'size'> &
  React.ComponentProps<'a'>

const PaginationLink = ({
  className,
  isActive,
  size = 'icon',
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      /* The current page wears the PRIMARY fill - the selection language the
         Figma Pagination drawing (132:966) shares with Calendar's chosen day.
         (It was `secondary` outlined before the drawing existed; selection is
         a fill, emphasis is an outline.) The rest are `tertiary` (quiet). */
      buttonVariants({
        variant: isActive ? 'primary' : 'tertiary',
        size,
      }),
      className
    )}
    {...props}
  />
)

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { disabled?: boolean }) => {
  const isDisabled = props.disabled ?? false

  return (
    <PaginationLink
      aria-label="Go to previous page"
      aria-disabled={isDisabled}
      size="default"
      className={cn(
        "gap-1 pl-2.5",
        isDisabled && "opacity-40 pointer-events-none",
        className
      )}
      {...props}
    >
      <ChevronLeft size={16} />
      <span>Previous</span>
    </PaginationLink>
  )
}
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { disabled?: boolean }) => {
  const isDisabled = props.disabled ?? false

  return (
    <PaginationLink
      aria-label="Go to next page"
      aria-disabled={isDisabled}
      size="default"
      className={cn(
        "gap-1 pr-2.5",
        isDisabled && "opacity-40 pointer-events-none",
        className
      )}
      {...props}
    >
      <span>Next</span>
      <ChevronRight size={16} />
    </PaginationLink>
  )
}
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span
    aria-hidden
    className={cn('flex h-9 w-9 items-center justify-center', className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
)
PaginationEllipsis.displayName = 'PaginationEllipsis'

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
