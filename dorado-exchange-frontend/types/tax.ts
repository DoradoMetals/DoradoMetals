import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { Address } from '../features/addresses/types'
import { Product } from '../features/products/types'
import { SpotPrice } from './metal'

export interface StateTaxDetail {
  fips: string
  name: string
  header: string
  bullets: string[]
}

export type SalesTaxInput = {
  address: Address
  items: Product[]
  spots: SpotPrice[]
}

export const stateTaxData: Record<string, StateTaxDetail> = {
  '01': {
    fips: '01',
    name: 'Alabama',
    header:
      'Dorado Metals Exchange is required to collect Alabama sales tax on the following items:',
    bullets: [
      'Products below 90% purity.',
      'Dorado Metals Exchange has collected the Simplified Sellers Use Tax on certain transactions delivered into Alabama and the tax will be remitted on the customer’s behalf to the Alabama Department of Revenue.',
      'Taxes in Alabama are calculated at checkout on the Dorado Metals Exchange website based on (1) the taxability of products sold by Dorado Metals Exchange in Alabama set forth above and (2) the Alabama Simplified Sellers Use Tax rate of 8%.',
    ],
  },
  '02': {
    fips: '02',
    name: 'Alaska',
    header: 'Dorado Metals Exchange is not required to collect Alaska sales tax.',
    bullets: [],
  },
  '04': {
    fips: '04',
    name: 'Arizona',
    header: 'Dorado Metals Exchange is not required to collect Arizona sales tax.',
    bullets: [],
  },
  '05': {
    fips: '05',
    name: 'Arkansas',
    header: 'Dorado Metals Exchange is not required to collect Arkansas sales tax.',
    bullets: [],
  },
  '06': {
    fips: '06',
    name: 'California',
    header:
      'Dorado Metals Exchange is required to collect California sales tax on the following items:',
    bullets: [
      'All Palladium products.',
      'All Platinum bullion.',
      'All Gold and Silver products less than $2,000.',
      'Platinum and Palladium coins less than $2,000.',
    ],
  },
  '08': {
    fips: '08',
    name: 'Colorado',
    header: 'Dorado Metals Exchange is not required to collect Colorado sales tax.',
    bullets: [],
  },
  '09': {
    fips: '09',
    name: 'Connecticut',
    header:
      'Dorado Metals Exchange is required to collect Connecticut sales tax on the following items:',
    bullets: [
      'All Palladium products.',
      'All Platinum products.',
      'Gold & Silver transactions less than $1,000.',
    ],
  },
  '10': {
    fips: '10',
    name: 'Delaware',
    header: 'Dorado Metals Exchange is not required to collect Delaware sales tax.',
    bullets: [],
  },
  '11': {
    fips: '11',
    name: 'District of Columbia',
    header:
      'Dorado Metals Exchange is required to collect District of Columbia sales tax on the following items:',
    bullets: ['All products.'],
  },
  '12': {
    fips: '12',
    name: 'Florida',
    header:
      'Dorado Metals Exchange is required to collect Florida sales tax on the following items:',
    bullets: [
      'All products if the total transaction is less than $500 unless legal tender of the U.S. or sold at face value of a foreign currency.',
    ],
  },
  '13': {
    fips: '13',
    name: 'Georgia',
    header:
      'Dorado Metals Exchange is required to collect Georgia sales tax on the following items:',
    bullets: ['All Palladium products.'],
  },
  '15': {
    fips: '15',
    name: 'Hawaii',
    header:
      'Dorado Metals Exchange is required to collect Hawaii sales tax on the following items:',
    bullets: ['All products.'],
  },
  '16': {
    fips: '16',
    name: 'Idaho',
    header: 'Dorado Metals Exchange is not required to collect Idaho sales tax.',
    bullets: [],
  },
  '17': {
    fips: '17',
    name: 'Illinois',
    header:
      'Dorado Metals Exchange is required to collect Illinois sales tax on the following items:',
    bullets: ['All Palladium bullion.', 'All products below 98% purity.'],
  },
  '18': {
    fips: '18',
    name: 'Indiana',
    header:
      'Dorado Metals Exchange is required to collect Indiana sales tax on the following items:',
    bullets: [
      'Foreign Gold products below 99.5% purity.',
      'Foreign Silver products below 99.9% purity.',
      'Foreign Platinum products below 99.95% purity.',
      'Foreign Palladium products below 99.95% purity.',
    ],
  },
  '19': {
    fips: '19',
    name: 'Iowa',
    header: 'Dorado Metals Exchange is not required to collect Iowa sales tax.',
    bullets: [],
  },
  '20': {
    fips: '20',
    name: 'Kansas',
    header:
      'Dorado Metals Exchange is required to collect Kansas sales tax on the following items:',
    bullets: ['Platinum coins.', 'Palladium coins.'],
  },
  '21': {
    fips: '21',
    name: 'Kentucky',
    header: 'Dorado Metals Exchange is not required to collect Kentucky sales tax.',
    bullets: [],
  },
  '22': {
    fips: '22',
    name: 'Louisiana',
    header:
      'Dorado Metals Exchange is required to collect Louisiana sales tax on the following items:',
    bullets: ['All Palladium products.'],
  },
  '23': {
    fips: '23',
    name: 'Maine',
    header: 'Dorado Metals Exchange is required to collect Maine sales tax on the following items:',
    bullets: ['All products.'],
  },
  '24': {
    fips: '24',
    name: 'Maryland',
    header:
      'Dorado Metals Exchange is required to collect Maryland sales tax on the following items:',
    bullets: [
      'Coins that have not been used as mediums of exchange in any country.',
      'Transactions less than or equal to $1,000.',
    ],
  },
  '25': {
    fips: '25',
    name: 'Massachusetts',
    header:
      'Dorado Metals Exchange is required to collect Massachusetts sales tax on the following items:',
    bullets: [
      'All Platinum products.',
      'All Palladium products.',
      'Any transaction containing Gold or Silver products less than $1,000.',
    ],
  },
  '26': {
    fips: '26',
    name: 'Michigan',
    header:
      'Dorado Metals Exchange is required to collect Michigan sales tax on the following items:',
    bullets: ['All Palladium products.', 'Products below 90% purity.'],
  },
  '27': {
    fips: '27',
    name: 'Minnesota',
    header:
      'Dorado Metals Exchange is required to collect Minnesota sales tax on the following items:',
    bullets: ['All coins.', 'All products below .999 purity.'],
  },
  '28': {
    fips: '28',
    name: 'Mississippi',
    header: 'Dorado Metals Exchange is not required to collect Mississippi sales tax.',
    bullets: [],
  },
  '29': {
    fips: '29',
    name: 'Missouri',
    header: 'Dorado Metals Exchange is not required to collect Missouri sales tax.',
    bullets: [],
  },
  '30': {
    fips: '30',
    name: 'Montana',
    header: 'Dorado Metals Exchange is not required to collect Montana sales tax.',
    bullets: [],
  },
  '31': {
    fips: '31',
    name: 'Nebraska',
    header: 'Dorado Metals Exchange is not required to collect Nebraska sales tax.',
    bullets: [],
  },
  '32': {
    fips: '32',
    name: 'Nevada',
    header: 'Dorado Metals Exchange is not required to collect Nevada sales tax.',
    bullets: [],
  },
  '33': {
    fips: '33',
    name: 'New Hampshire',
    header: 'Dorado Metals Exchange is not required to collect New Hampshire sales tax.',
    bullets: [],
  },
  '34': {
    fips: '34',
    name: 'New Jersey',
    header:
      'Dorado Metals Exchange is required to collect New Jersey sales tax on the following items:',
    bullets: ['Coins less than or equal to $1,000.'],
  },
  '35': {
    fips: '35',
    name: 'New Mexico',
    header:
      'Dorado Metals Exchange is required to collect New Mexico sales tax on the following items:',
    bullets: ['All products.'],
  },
  '36': {
    fips: '36',
    name: 'New York',
    header:
      'Dorado Metals Exchange is required to collect New York sales tax on the following items:',
    bullets: [
      'Transactions less than or equal to $1,000.',
      'Silver coins if the sales price is greater than or equal to 140% of the Silver value in the coin.',
      'Gold coins containing more than 1/4 ounce of Gold content, along with the sales price being greater than 115% of the Gold value in the coin.',
      'Platinum coins if the sales price is greater than or equal to 115% of the Platinum value in the coin.',
      'Palladium coins if the sales price is greater than or equal to 115% of the Palladium value in the coin.',
      'All products if the sales price is greater than or equal to 115% of the metal value in the item.',
    ],
  },
  '37': {
    fips: '37',
    name: 'North Carolina',
    header: 'Dorado Metals Exchange is not required to collect North Carolina sales tax.',
    bullets: [],
  },
  '38': {
    fips: '38',
    name: 'North Dakota',
    header:
      'Dorado Metals Exchange is required to collect North Dakota sales tax on the following items:',
    bullets: ['All products below 99.9% purity.'],
  },
  '39': {
    fips: '39',
    name: 'Ohio',
    header: 'Dorado Metals Exchange is required to collect Ohio sales tax on the following items:',
    bullets: [
      'Gold products below 99.5% purity.',
      'Silver products below 99.9% purity.',
      'Platinum products below 99.95% purity.',
      'Palladium products below 99.95% purity.',
      'All coins with less than 50% metal content.',
    ],
  },
  '40': {
    fips: '40',
    name: 'Oklahoma',
    header: 'Dorado Metals Exchange is not required to collect Oklahoma sales tax.',
    bullets: [],
  },
  '41': {
    fips: '41',
    name: 'Oregon',
    header: 'Dorado Metals Exchange is not required to collect Oregon sales tax.',
    bullets: [],
  },
  '42': {
    fips: '42',
    name: 'Pennsylvania',
    header:
      'Dorado Metals Exchange is required to collect Pennsylvania sales tax on the following items:',
    bullets: ['All products.'],
  },
  '44': {
    fips: '44',
    name: 'Rhode Island',
    header:
      'Dorado Metals Exchange is required to collect Rhode Island sales tax on the following items:',
    bullets: ['All products.'],
  },
  '45': {
    fips: '45',
    name: 'South Carolina',
    header:
      'Dorado Metals Exchange is required to collect South Carolina sales tax on the following items:',
    bullets: [
      'All Palladium products.',
      `South Carolina state law requires us to notify customers that any South Carolina customer over the age of 85 is entitled to a 1% reduction in sales tax for any items purchased for personal use. If you would like to claim this reduction, please place your order over the phone at ${formatPhoneNumber(
        process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? ''
      )}. You must present proof of identity verification to confirm your order.`,
    ],
  },
  '46': {
    fips: '46',
    name: 'South Dakota',
    header:
      'Dorado Metals Exchange is required to collect South Dakota sales tax on the following items:',
    bullets: ['All products.'],
  },
  '47': {
    fips: '47',
    name: 'Tennessee',
    header:
      'Dorado Metals Exchange is required to collect Tennessee sales tax on the following items:',
    bullets: ['All products.'],
  },
  '48': {
    fips: '48',
    name: 'Texas',
    header: 'Dorado Metals Exchange is required to collect Texas sales tax on the following items:',
    bullets: ['Platinum coins.', 'All Palladium products.'],
  },
  '49': {
    fips: '49',
    name: 'Utah',
    header: 'Dorado Metals Exchange is required to collect Utah sales tax on the following items:',
    bullets: ['All Palladium products.', 'Any product below 50% purity.'],
  },
  '50': {
    fips: '50',
    name: 'Vermont',
    header:
      'Dorado Metals Exchange is required to collect Vermont sales tax on the following items:',
    bullets: ['All products.'],
  },
  '51': {
    fips: '51',
    name: 'Virginia',
    header:
      'Dorado Metals Exchange is required to collect Virginia sales tax on the following items:',
    bullets: ['All Palladium products.'],
  },
  '53': {
    fips: '53',
    name: 'Washington',
    header:
      'Dorado Metals Exchange is required to collect Washington sales tax on the following items:',
    bullets: ['All products.'],
  },
  '54': {
    fips: '54',
    name: 'West Virginia',
    header: 'Dorado Metals Exchange is not required to collect West Virginia sales tax.',
    bullets: [],
  },
  '55': {
    fips: '55',
    name: 'Wisconsin',
    header:
      'Dorado Metals Exchange is required to collect Wisconsin sales tax on the following items:',
    bullets: ['All products with less than 35% metal content.'],
  },
  '56': {
    fips: '56',
    name: 'Wyoming',
    header: 'Dorado Metals Exchange is not required to collect Wyoming sales tax.',
    bullets: [],
  },
}
