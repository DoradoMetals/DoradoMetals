'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import ProductSearch from './productSearch'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, X } from 'lucide-react'
import { Form } from '@/components/ui/form'
import { productFormSchema, ProductFormSchema } from '@/types/admin'
import { useAdminProducts } from '@/lib/queries/admin/useAdminProducts'
import ProductForm from './productForm'
import { useState } from 'react'

export default function ProductsTab() {
  const { data: products = [], isPending } = useAdminProducts()
  const [showCreateButton, setShowCreateButton] = useState(true)
  const [creatingNew, setCreatingNew] = useState(false)

  const form = useForm<ProductFormSchema>({
    resolver: zodResolver(productFormSchema),
    mode: 'onChange',
    defaultValues: {
      metal: 'Gold',
      supplier: 'Elemetal',
      product_name: '',
      product_description: '',
      bid_premium: 0,
      ask_premium: 0,
      product_type: 'Bar',
      display: true,
      content: 0,
      gross: 0,
      purity: 0,
      mint: 'Elemetal',
      variant_group: '',
      shadow_offset: 0,
      stock: 0,
      price: 0,
    },
  })

  const productName = form.watch('product_name') ?? ''
  const matchedProduct = products.find(
    (p) => p.product_name.toLowerCase() === productName.toLowerCase()
  )

  return (
    <div
      tabIndex={-1}
      className="outline-none focus:outline-none flex flex-col w-full mt-8 mb-8 space-y-6"
    >
      <Form {...form}>
        <div className="flex items-center w-full gap-3">
          {creatingNew ? (
            <div className="flex w-full justify-end">
              <Button
                variant="ghost"
                className="ml-auto flex items-center gap-2 text-neutral-700 hover:bg-background"
                onClick={() => {
                  form.reset()
                  setCreatingNew(false)
                  setShowCreateButton(false)
                }}
              >
                <X size={16} />
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center w-full gap-3">
              <div className="flex-1">
                <ProductSearch
                  form={form}
                  products={products}
                  setShowCreateButton={setShowCreateButton}
                />
              </div>

              {showCreateButton ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1 text-neutral-800 bg-secondary hover:bg-secondary border-secondary px-2 text-sm font-light h-11"
                  onClick={() => {
                    form.reset()
                    setCreatingNew(true)
                  }}
                >
                  <Plus size={16} />
                  Create New
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1 text-neutral-800 bg-destructive hover:bg-destructive border-destructive px-2 text-sm font-light h-11"
                  onClick={() => {
                    form.reset()
                    setShowCreateButton(true)
                  }}
                >
                  <Trash2 size={20} />
                  Remove Product
                </Button>
              )}
            </div>
          )}
        </div>

        {(matchedProduct || creatingNew) && <ProductForm form={form} creatingNew={creatingNew} />}
      </Form>
    </div>
  )
}
