export interface Package {
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
  'FedEx Small (Double Boxed)': {
    weight: { units: 'LB', value: 2 },
    dimensions: { length: 10.88, width: 1.5, height: 12.13, units: 'IN' },
  },
  'FedEx Medium (Double Boxed)': {
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 13.25, width: 11.5, height: 2.38, units: 'IN' },
  },
  'FedEx Large (Double Boxed)': {
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 17.88, width: 12.38, height: 3, units: 'IN' },
  },
}

export const uninsuredPackageOptions: Record<string, Package> = {
  'Medium': {
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 12, width: 10, height: 4, units: 'IN' },
  },
  'Large': {
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 18, width: 14, height: 6, units: 'IN' },
  },
  'Custom': {
    weight: { units: 'LB', value: 0 }, // Placeholder
    dimensions: { length: 0, width: 0, height: 0, units: 'IN' },
  },
}

