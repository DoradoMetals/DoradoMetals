import { Control } from 'react-hook-form'
import { Payout } from '@/types/payout'
import {
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { ValidCheckIcon } from '@/components/ui/valid-check-icon'
import EcheckFields from './echeckForm'
import ACHFields from './achForm'
import WireFields from './wireForm'

interface Props {
  control: Control<Payout>
  method: string
}


export default function PayoutFields({
  method,
  control,
}: {
  method: string
  control: Control<Payout>
}) {
  switch (method) {
    case 'ECHECK':
      return <EcheckFields control={control} />
    case 'ACH':
      return <ACHFields control={control} />
    case 'WIRE':
      return <WireFields control={control} />
    default:
      return null
  }
}