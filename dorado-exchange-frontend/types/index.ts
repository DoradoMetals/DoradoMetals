export interface Product {
  id: string,
  metal_id: string,
  content_id: string,
  supplier_id: string,
  product_name: string,
  product_description: string,
  bid: number,
  ask: number,
  product_type: string,
  created_at: Date,
  updated_at: Date,
  image_front: string,
  image_back: string,
}

export interface User {
  id: string,
  name: string,
  email: string,
  emailVerified: boolean,
  createdAt: Date,
  updatedAt: Date,
  image?: string | null,
}

export interface Address {
  id: string,
  user_id: string,
  line_1: string,
  line_2: string,
  city: string,
  state: string,
  country: string,
  zip: string,
  is_default: boolean,
  created_at: Date,
  updated_at: Date,
  name: string,
}