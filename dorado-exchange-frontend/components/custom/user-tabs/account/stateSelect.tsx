import { useState } from "react";
import { FormItem, FormLabel } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { states } from "@/types/address";

const stateOptions = states;

interface StateSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function StateSelect({ value, onChange }: StateSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <FormItem className="w-full">
      <div className="text-md text-gray-500 m-0 p-0">
        <FormLabel >State</FormLabel>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`w-full justify-between px-3 py-2 text-sm h-9 hover:bg-background
              ${!value ? "font-light" : "font-normal"}`}
            >
            {value ? value : "Select a state"}
            <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
          </Button>


        </PopoverTrigger>
        <PopoverContent align="start" side="bottom" className="w-[var(--radix-popover-trigger-width)] p-0 bg-background !important">
          <Command className="bg-background">
            <CommandInput placeholder="Search state..." className="h-8 text-sm" />
            <CommandList className="max-h-40 overflow-y-auto bg-background">
              {stateOptions.map((state) => (
                <CommandItem
                  key={state}
                  onSelect={() => { onChange(state); setOpen(false); }}
                  className="h-8 px-2 text-sm"
                >
                  <Check className={`mr-2 h-4 w-4 ${value === state ? "opacity-100" : "opacity-0"}`} />
                  {state}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FormItem>
  );
}
