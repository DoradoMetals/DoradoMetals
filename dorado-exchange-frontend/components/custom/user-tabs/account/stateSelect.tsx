import { useState } from 'react'
import { FormItem, FormLabel } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Asterisk, Check, ChevronDown } from 'lucide-react'
import { states, stateMap } from '@/types/states' // Import mapping of abbreviations to full names
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

const stateOptions = states

interface StateSelectProps {
  value: string
  onChange: (value: string) => void
}

export function StateSelect({ value, onChange }: StateSelectProps) {
  const [open, setOpen] = useState(false)

  // Function to validate & convert state abbreviations
  const handleStateChange = (inputValue: string) => {
    const normalizedState =
      stateMap[inputValue.toUpperCase() as keyof typeof stateMap] || inputValue
    onChange(normalizedState)
  }

  return (
    <FormItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative w-full">
            <FloatingLabelInput
              label="State"
              type="text"
              autoComplete="address-level1"
              size="xs"
              onChange={(e) => handleStateChange(e.target.value)}
              className="cursor-pointer bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
              value={value}
            />
            <ChevronDown size={16} className="cursor-pointer ml-auto absolute right-9 top-1/2 -translate-y-1/2 opacity-70" />
            <Asterisk
              size={20}
              className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-[var(--radix-popover-trigger-width)] p-0 bg-background !important"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command className="bg-background">
            <CommandInput placeholder="Search state..." className="h-8 text-sm" />
            <CommandList className="max-h-40 overflow-y-auto bg-background">
              {stateOptions.map((state) => (
                <CommandItem
                  key={state}
                  onSelect={() => {
                    onChange(state)
                    setOpen(false)
                  }}
                  className="h-8 px-2 text-sm"
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value === state ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {state}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FormItem>
  )
}
