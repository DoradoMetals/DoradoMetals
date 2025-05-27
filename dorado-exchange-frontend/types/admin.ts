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
  homepage_display: boolean
  filter_category: string
  quantity: number
  slug: string
}

export interface AdminMetal {
  id: string,
  type: string,
  ask_spot: string,
  bid_spot: string,
  percent_change: string,
  dollar_change: string,
  scrap_percentage: number,
  bullion_percentage: number,
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
  pre_melt: number,
  post_melt: number,
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

export interface InventoryProduct {
  id: string;
  product_name: string;
  bid_premium: number;
  ask_premium: number;
  product_type: 'Coin' | 'Bar' | string;
  content: number;
  quantity: number;
}

export interface InventoryGroup {
  total_content: number;
  coins: number;
  bars: number;
  other: number;
  inventory_list: InventoryProduct[];
}

export interface AdminProductsInventory {
  Gold: InventoryGroup;
  Silver: InventoryGroup;
  Platinum: InventoryGroup;
  Palladium: InventoryGroup;
}