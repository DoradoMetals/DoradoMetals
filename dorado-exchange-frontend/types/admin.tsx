import { string, z } from 'zod'
import {
  Truck,
  PackageOpen,
  FlaskConical,
  CheckCheck,
  X,
  CreditCard,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { Dispatch } from 'react';

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

export interface AdminPurchaseOrder {
  id: string,
  order_number: number,
  order_status: string,
  notes: string,
  created_at: Date,
  updated_at: Date,
  updated_by: string,
  user_id: string,
  username: string,
}

export const statusConfig: Record<
  string,
  {
    text_color: string;
    background_color: string;
    icon: React.ElementType; // still a component, not JSX
  }
> = {
  'In Transit': {
    background_color: 'bg-cyan-300',
    text_color: 'text-cyan-300',
    icon: Truck,
  },
  Unsettled: {
    background_color: 'bg-fuchsia-400',
    text_color: 'text-fuchsia-400',
    icon: PackageOpen,
  },
  Filled: {
    background_color: 'bg-yellow-400',
    text_color: 'text-yellow-400',
    icon: FlaskConical,
  },
  Accepted: {
    background_color: 'bg-orange-500',
    text_color: 'text-orange-500',
    icon: CheckCheck,
  },
  Rejected: {
    background_color: 'bg-rose-400',
    text_color: 'text-rose-400',
    icon: X,
  },
  Settled: {
    background_color: 'bg-sky-600',
    text_color: 'text-sky-600',
    icon: CreditCard,
  },
  Cancelled: {
    background_color: 'bg-red-600',
    text_color: 'text-red-600',
    icon: Ban,
  },
  Completed: {
    background_color: 'bg-green-500',
    text_color: 'text-green-500',
    icon: ShieldCheck,
  },
};

export interface AdminPurchaseOrderDrawerProps {
  order: AdminPurchaseOrder
  user_id: string 
  isOrderActive: boolean
  setIsOrderActive: Dispatch<React.SetStateAction<boolean>>
}

export interface AdminPurchaseOrderDrawerHeaderProps {
  order: AdminPurchaseOrder
  username: string
}

export interface AdminPurchaseOrderDrawerContentProps {
  order: AdminPurchaseOrder
}
