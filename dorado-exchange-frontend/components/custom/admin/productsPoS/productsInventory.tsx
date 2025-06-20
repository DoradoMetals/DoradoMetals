// Top-level component: wire up selectedMetal state
import { useState } from 'react'
import ProductCards from './productCards'
import ProductsTableEditable from './productTable'

export default function ProductsInventory() {
  const [selectedMetal, setSelectedMetal] = useState<string | null>(null)

  return (
    <div className="">
      <ProductCards selectedMetal={selectedMetal ?? ''} setSelectedMetal={setSelectedMetal} />
      <ProductsTableEditable selectedMetal={selectedMetal ?? ''} />
    </div>
  )
}
