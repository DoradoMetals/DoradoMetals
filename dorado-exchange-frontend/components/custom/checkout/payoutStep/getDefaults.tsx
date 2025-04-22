import { Payout } from '@/types/payout'
import { User } from '@/types/user'

export function getDefaultValues(method: Payout['method'], user?: User): Payout {
  switch (method) {
    case 'ECHECK':
      return {
        method,
        payout_name: user?.name ?? '',
        payout_email: user?.email ?? '',
      }

    case 'ACH':
      return {
        method,
        account_holder_name: user?.name ?? '',
        bank_name: '',
        routing_number: '',
        account_number: '',
        account_type: 'checking',
      }

    case 'WIRE':
      return {
        method,
        account_holder_name: user?.name ?? '',
        bank_name: '',
        routing_number: '',
        account_number: '',
      }

    default:
      throw new Error('Unsupported payout method')
  }
}
