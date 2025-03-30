export interface Product {
  metal_id: string,
  product_name: string,
  product_description: string,
  bid_premium: number,
  ask_premium: number,
  product_type: string,
  image_front: string,
  image_back: string,
  quantity?: number,
  mint_name: string,
}

export const ozOptions: Record<string, { value: string; label: string; disabled: boolean }[]> = {
  'Gold American Eagle (1 oz)': [
    { value: '1/10', label: '.10 oz', disabled: false },
    { value: '1/4', label: '.25 oz', disabled: false },
    { value: '1/2', label: '.5 oz', disabled: false },
    { value: '1', label: '1 oz', disabled: false },
  ],
  'Gold Canadian Maple (1 oz)': [
    { value: '1/10', label: '.10 oz', disabled: false },
    { value: '1/4', label: '.25 oz', disabled: false },
    { value: '1/2', label: '.5 oz', disabled: false },
    { value: '1', label: '1 oz', disabled: false },
  ],
}