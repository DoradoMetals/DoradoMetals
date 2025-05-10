// Top-level component: wire up selectedMetal state
import { useState } from 'react'
import ProductCards from './productCards'
import ProductsTableEditable from './productTable'

export default function ProductsInventory() {
  const [selectedMetal, setSelectedMetal] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <ProductCards selectedMetal={selectedMetal ?? ''} setSelectedMetal={setSelectedMetal} />
      <ProductsTableEditable selectedMetal={selectedMetal ?? ''} />
    </div>
  )
}
