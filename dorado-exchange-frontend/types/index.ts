import { UUID } from "crypto";
import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export interface Product{
  id: UUID,
  product_code: string,
  name: string,
  metal_id: UUID,
  weight: number,
  bid_price: number,
  ask_price: number,
  availability: boolean,
  image: string,
}