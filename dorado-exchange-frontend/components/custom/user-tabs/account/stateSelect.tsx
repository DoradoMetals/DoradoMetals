import { useState } from 'react'
import { FormItem, FormLabel } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown } from 'lucide-react'
import { states, stateMap } from '@/types/states' // Import mapping of abbreviations to full names

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
    <FormItem className="w-full">
      <div className="text-md text-gray-500 m-0 p-0">
        <FormLabel>State</FormLabel>
      </div>

      {/* Hidden input for Google Autofill */}
      <input
        type="text"
        autoComplete="address-level1"
        value={value}
        onChange={(e) => handleStateChange(e.target.value)} // Convert abbreviations instantly
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            className="w-full font-normal flex px-3 py-2 text-sm h-9 bg-background hover:bg-background border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
          >
            {value}
            <ChevronDown className="ml-auto h-4 w-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-[var(--radix-popover-trigger-width)] p-0 bg-background !important"
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
