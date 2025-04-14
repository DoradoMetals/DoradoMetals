export interface Package {
  label: string,
  weight: { 
    units: 'LB', 
    value: number
  },
  dimensions: {
    length: number,
    width: number,
    height: number,
    units: 'IN'
  }
}

export const insuredPackageOptions: Record<string, Package> = {

  'FedEx Medium': {
    label: 'FedEx Medium',
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 13.25, width: 11.5, height: 2.38, units: 'IN' },
  },
  'FedEx Large': {
    label: 'FedEx Large',
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 17.88, width: 12.38, height: 3, units: 'IN' },
  },
}

export const uninsuredPackageOptions: Record<string, Package> = {
  'Medium': {
    label: 'Medium',
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 12, width: 10, height: 4, units: 'IN' },
  },
  'Large': {
    label: 'Large',
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 18, width: 14, height: 6, units: 'IN' },
  },
  'Custom': {
    label: 'Custom',
    weight: { units: 'LB', value: 0 }, // Placeholder
    dimensions: { length: 0, width: 0, height: 0, units: 'IN' },
  },
}

