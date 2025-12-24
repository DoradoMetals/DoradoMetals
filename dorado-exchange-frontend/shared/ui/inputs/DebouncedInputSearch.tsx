import { useEffect, useState } from 'react'

import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '../base/button'
import { Input } from '../base/input'
import { cn } from '@/shared/utils/cn'

export function DebouncedInputSearch({
  value: initialValue,
  onChange,
  inputClassname = 'border-border bg-highest focus:border-primary focus-visible:border-primary shadow-none',
  debounce = 300,
  showSearchIcon = true,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  inputClassname?: string
  debounce?: number
  showSearchIcon?: Boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)
    return () => clearTimeout(timeout)
  }, [value, debounce])

  const handleClear = () => {
    setValue('')
    onChange('')
  }

  return (
    <div className="relative w-full h-10">
      <Input
        {...props}
        className={cn("px-8 lg:px-10 h-10 ", inputClassname)}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {showSearchIcon && (
        <div className="absolute left-2 lg:left-3 top-1/2 -translate-y-1/2 hover:bg-transparent">
          <MagnifyingGlassIcon className="text-neutral-600" size={18} />
        </div>
      )}

      {value !== '' && (
        <Button
          variant="ghost"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
          tabIndex={-1}
        >
          <XIcon size={16} />
        </Button>
      )}
    </div>
  )
}
