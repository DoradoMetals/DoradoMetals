// import { Control, UseFormReturn } from 'react-hook-form'
// import { FormField, FormItem, FormControl } from '@/components/ui/form'
// import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
// import { payoutOptions } from '@/types/payout'
// import { Payout } from '@/types/payout'
// import { CheckCircle } from 'lucide-react'
// import { cn } from '@/lib/utils'
// import { User } from '@/types/user'
// import { getDefaultValues } from './getDefaults'
// import { useRef } from 'react'


// export default function PayoutSelector({
//   form,
//   user,
// }: {
//   form: UseFormReturn<Payout>
//   user?: User
// }) {
//   const methodDraftsRef = useRef<Partial<Record<Payout['method'], Partial<Payout>>>>({})

//   const { control, reset, getValues } = form
//   return (
//     <FormField
//       control={control}
//       name="method"
//       render={({ field }) => (
//         <FormItem className="space-y-2">
//           <RadioGroup
//             value={field.value}
//             onValueChange={(newValue) => {
//               field.onChange(newValue)
//               reset({
//               ...getValues(), // keep whatever they’ve typed
//               ...getDefaultValues(newValue as Payout['method'], user), // overwrite only fields needed for the new method
//             })
//             }}
//             className="gap-3 w-full flex flex-col"
//           >
//             {payoutOptions.map((option) => {
//               const isSelected = field.value === option.method

//               return (
//                 <label
//                   key={option.method}
//                   htmlFor={option.method}
//                   className={cn(
//                     'relative peer flex flex-col items-start justify-center w-full gap-1 rounded-lg border border-border bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:shadow-md'
//                   )}
//                 >
//                   <div className="absolute top-2 right-2">
//                     <CheckCircle
//                       size={16}
//                       className={cn(
//                         'transition-opacity duration-200',
//                         isSelected ? 'text-primary opacity-100' : 'opacity-0'
//                       )}
//                     />
//                   </div>

//                   <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
//                     {option.icon && <option.icon size={20} className="text-primary" />}
//                     {option.label}
//                   </div>

//                   {option.description && (
//                     <div className="text-sm text-neutral-600">{option.description}</div>
//                   )}

//                   <RadioGroupItem id={option.method} value={option.method} className="sr-only" />
//                 </label>
//               )
//             })}
//           </RadioGroup>
//         </FormItem>
//       )}
//     />
//   )
// }
