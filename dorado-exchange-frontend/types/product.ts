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
  'Gold American Eagle': [
    { value: '1/10 oz', label: '.10 oz', disabled: false, name: 'Gold American Eagle (1/10 oz)'},
    { value: '1/4 oz', label: '.25 oz', disabled: false, name: 'Gold American Eagle (1/4 oz)'},
    { value: '1/2 oz', label: '.5 oz', disabled: false, name: 'Gold American Eagle (1/2 oz)'},
    { value: '1 oz', label: '1 oz', disabled: false, name: 'Gold American Eagle (1 oz)'},
  ],
  'Gold Canadian Maple': [
    { value: '1/10 oz', label: '.10 oz', disabled: false, name: 'Gold Canadian Maple (1/10 oz)'},
    { value: '1/4 oz', label: '.25 oz', disabled: false, name: 'Gold Canadian Maple (1/4 oz)'},
    { value: '1/2 oz', label: '.5 oz', disabled: false, name: 'Gold Canadian Maple (1/2 oz)'},
    { value: '1 oz', label: '1 oz', disabled: false, name: 'Gold Canadian Maple (1 oz)'},
  ],
  'Gold Bar': [
    { value: '1 oz', label: '1 oz', disabled: false, name: '1oz Gold Bar'},
    { value: '10 oz', label: '10 oz', disabled: false, name: '10oz Gold Bar'},
    { value: '1 kilo', label: '32.15 oz', disabled: false, name: '1 Kilo Gold Bar'},
  ],
  'Silver Unity Bar': [
    { value: '1 oz', label: '1 oz', disabled: false, name: '1oz Unity'},
    { value: '5 oz', label: '5 oz', disabled: false, name: '5oz Unity'},
    { value: '10 oz', label: '10 oz', disabled: false, name: '10oz Unity'},
  ],
  'Silver Elemetal Bar': [
    { value: '10 oz', label: '10 oz', disabled: false, name: '10oz Elemetal'},
    { value: '100 oz', label: '100 oz', disabled: false, name: '100oz Elemetal'},
  ],
  'Silver Freedom Bar': [
    { value: '5 oz', label: '5 oz', disabled: false, name: '5oz Freedom'},
    { value: '10 oz', label: '10 oz', disabled: false, name: '10oz Freedom'},
  ],
  'Silver Elemetal Coin': [
    { value: '1/2 oz', label: '.5 oz', disabled: false, name: 'Elemetal Fractional (1/2 oz)'},
    { value: '1 oz', label: '1 oz', disabled: false, name: 'Elemetal Round'},
  ],
}