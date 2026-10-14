import { Text } from '@dorado/components'

import { PricingNav } from './_components'

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-lg p-md lg:p-xl">
      <div className="flex flex-col gap-sm">
        <Text variant="h4" as="h1">
          Pricing
        </Text>
        <PricingNav />
      </div>
      {children}
    </div>
  )
}
