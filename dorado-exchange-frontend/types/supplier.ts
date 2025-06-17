export interface Supplier {
  id: string
  name: string
  email: string
  phone: string
  created_at: Date
  updated_at: Date
  shipping_carrier: string
  logo: string,
  is_active: boolean,
}
