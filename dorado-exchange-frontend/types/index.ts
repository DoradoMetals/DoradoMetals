import { UUID } from "crypto";

export interface Product {
  id: UUID,
  metal_id: UUID,
  content_id: UUID,
  supplier_id: UUID,
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
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null;
}