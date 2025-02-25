import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export interface Product{
  name: string,
  image: string,
  code: string,
  availability: boolean,
  price: number,
  in_cart: number,
  in_queue: number,
}