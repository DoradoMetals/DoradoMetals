import { string, z } from 'zod'

export interface AdminProduct {
  id: string
  metal: string
  supplier: string
  product_name: string
  product_description: string
  bid_premium: number
  ask_premium: number
  product_type: string
  created_at: Date
  updated_at: Date
  image_front: string
  image_back: string
  display: boolean
  content: number
  gross: number
  purity: number
  mint: string 
  variant_group: string
  shadow_offset: number
  stock: number
  created_by: string
  updated_by: string
}

export interface AdminMetal {
  id: string,
  type: string,
  ask_spot: string,
  bid_spot: string,
  percent_change: string,
  dollar_change: string,
}

export interface AdminSuppliers {
  id: string,
  name: string,
  email: string,
  phone: string,
  created_at: Date,
  updated_at: Date,
}

export interface AdminMints {
  id: string,
  name: string,
  type: string,
  country: string,
  description: string,
  website: string,
  created_at: Date,
  updated_at: Date,
}

export interface AdminTypes {
  name: string,
}

export const searchSchema = z.object({
  search: z.string().max(100).optional(),
})

export type SearchProducts = z.infer<typeof searchSchema>

export const productFormSchema = z.object({
  metal: z.string().min(1, 'Metal is required'),
  supplier: z.string().min(1, 'Supplier is required'),
  product_name: z.string().min(1, 'Product name is required'),
  product_description: z.string().max(1000, 'Description is too long').optional(),
  bid_premium: z.coerce
    .number()
    .min(0, 'Bid premium cannot be negative')
    .max(10000, 'Bid premium seems too high'),
  ask_premium: z.coerce
    .number()
    .min(0, 'Ask premium cannot be negative')
    .max(10000, 'Ask premium seems too high'),
  product_type: z.string().min(1, 'Product type is required'),
  display: z.coerce.boolean(),
  content: z.coerce
    .number()
    .nonnegative('Content must be zero or more')
    .refine((val) => !isNaN(val), { message: 'Content must be a number' }),
  gross: z.coerce
    .number()
    .positive('Gross weight must be greater than 0')
    .refine((val) => /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()), {
      message: 'Gross must be a valid weight',
    }),
  purity: z.coerce
    .number()
    .min(0.001, 'Purity must be greater than 0')
    .max(1, 'Purity must be a decimal less than or equal to 1'),
  mint: z.string().min(1, 'Mint is required'),
  variant_group: z.string().max(100),
  shadow_offset: z.coerce
    .number()
    .min(-100, 'Shadow offset is too low')
    .max(100, 'Shadow offset is too high'),
  stock: z.coerce.number().int('Stock must be an integer').min(0, 'Stock must be 0 or more'),
})

export type ProductFormSchema = z.infer<typeof productFormSchema>

export interface AdminScrap {
  order_item_id: string,
  order_id: string,
  order_number: number,
  order_status: string,
  created_at: Date,
  updated_at: Date,
  updated_by: string,
  user_id: string,
  username: string,
  scrap_id: string,
  gross: number,
  purity: number,
  content: number,
  gross_unit: string,
  metal: string
}

export interface AdminUser {
  id: string,
  email: string,
  name: string,
  created_at: string,
  updated_at: string,
  email_verified: string,
  image: string,
  role: string,
}