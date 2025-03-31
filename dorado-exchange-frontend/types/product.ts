export interface Product {
  product_name: string,
  product_description: string,
  content: number,
  bid_premium: number,
  ask_premium: number,
  product_type: string,
  image_front: string,
  image_back: string,
  quantity?: number,
  mint_name: string,
  price: number,
  metal_type: string,
  variant_group: string,
}

export const ozOptions: Record<string, { value: string; label: string; disabled: boolean, name: string }[]> = {
  'American Eagle': [
    { value: '1/10', label: '.10 oz', disabled: false, name: 'Gold American Eagle (1/10 oz)'},
    { value: '1/4', label: '.25 oz', disabled: false, name: 'Gold American Eagle (1/4 oz)'},
    { value: '1/2', label: '.5 oz', disabled: false, name: 'Gold American Eagle (1/2 oz)'},
    { value: '1', label: '1 oz', disabled: false, name: 'Gold American Eagle (1 oz)'},
  ],
  'Canadian Maple': [
    { value: '1/10', label: '.10 oz', disabled: false, name: 'Gold Canadian Maple (1/10 oz)'},
    { value: '1/4', label: '.25 oz', disabled: false, name: 'Gold Canadian Maple (1/4 oz)'},
    { value: '1/2', label: '.5 oz', disabled: false, name: 'Gold Canadian Maple (1/2 oz)'},
    { value: '1', label: '1 oz', disabled: false, name: 'Gold Canadian Maple (1 oz)'},
  ],
}