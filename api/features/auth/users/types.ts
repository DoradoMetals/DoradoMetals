export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
  emailVerified: boolean
  image: string
  role: string
  stripeCustomerId: string
  dorado_funds: number
  banned: boolean
  banReason: string
  banExpires: Date
  phone_number: string
}

export type AdjustUserCreditInput = {
  user_id: string;
  mode: 'add' | 'subtract' | 'edit';
  amount: number;
};