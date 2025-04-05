'use client'

import { UseFormReturn } from 'react-hook-form'
import { ProductFormSchema } from '@/types/admin'
import { FormField, FormItem, FormControl, FormMessage, FormLabel } from '@/components/ui/form'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { FloatingLabelTextarea } from '@/components/ui/floating-label-textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'

import {
  useAdminMetals,
  useAdminMints,
  useAdminSuppliers,
  useAdminTypes,
} from '@/lib/queries/admin/useAdmin'
import ProductOptionSelect from './productOptions'
import { Button } from '@/components/ui/button'

type Props = {
  form: UseFormReturn<ProductFormSchema>
  creatingNew: boolean
}

export default function ProductForm({ form, creatingNew }: Props) {
  const { data: metals } = useAdminMetals()
  const { data: suppliers } = useAdminSuppliers()
  const { data: mints } = useAdminMints()
  const { data: types } = useAdminTypes()

  return (
    <>
      <Tabs defaultValue="general" className="w-full h-full space-y-6">
        <TabsList className="w-full gap-2 rounded-none border-b border-border bg-transparent py-1">
          <TabsTrigger
            value="general"
            className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
          >
            General
          </TabsTrigger>
          <TabsTrigger
            value="pricing"
            className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
          >
            Pricing
          </TabsTrigger>
          <TabsTrigger
            value="dev"
            className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
          >
            Dev
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <FormField
            control={form.control}
            name="product_name"
            render={({ field }) => (
              <FormItem>
                <div className="relative w-full">
                  <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                </div>
                <FormControl>
                  <FloatingLabelInput
                    label="Product Name"
                    type="text"
                    size="sm"
                    className="input-floating-label-form"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="product_description"
            render={({ field }) => (
              <FormItem>
                <div className="relative w-full">
                  <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                </div>
                <FormControl>
                  <FloatingLabelTextarea
                    label="Product Description"
                    id="product_description"
                    rows={4}
                    size="sm"
                    className="resize-none input-floating-label-form"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex items-center justify-between gap-3 -mt-4">
            <ProductOptionSelect
              form={form}
              name="metal"
              label="Metal"
              options={metals?.map((m, index) => ({ id: index, name: m.type })) ?? []}
            />
            <ProductOptionSelect
              form={form}
              name="product_type"
              label="Product Type"
              options={types?.map((t, index) => ({ id: index, name: t.name })) ?? []}
            />
          </div>
          <div className="flex items-center justify-between gap-3 -mt-4">
            <ProductOptionSelect
              form={form}
              name="supplier"
              label="Supplier"
              options={suppliers?.map((s, index) => ({ id: index, name: s.name })) ?? []}
            />

            <ProductOptionSelect
              form={form}
              name="mint"
              label="Mint"
              options={mints?.map((m, index) => ({ id: index, name: m.name })) ?? []}
            />
          </div>
          <FormField
            control={form.control}
            name="stock"
            render={({ field }) => (
              <FormItem>
                <div className="relative w-full">
                  <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                </div>
                <FormControl>
                  <FloatingLabelInput
                    label="Stock"
                    type="text"
                    pattern="[0-9]*"
                    size="sm"
                    className="input-floating-label-form"
                    value={field.value === 0 ? '' : field.value}
                    onChange={(e) => {
                      const val = e.target.value
                      field.onChange(val === '' ? 0 : val)
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </TabsContent>

        <TabsContent value="pricing" className="space-y-6">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <div className="relative w-full">
                  <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                </div>
                <FormControl>
                  <FloatingLabelInput
                    label="Content"
                    type="text"
                    pattern="[0-9]*"
                    size="sm"
                    className="input-floating-label-form"
                    value={field.value === 0 ? '' : field.value}
                    onChange={(e) => {
                      const val = e.target.value
                      field.onChange(val === '' ? 0 : val)
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex items-center gap-3 justify-between">
            <FormField
              control={form.control}
              name="purity"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Purity"
                      type="text"
                      pattern="[0-9]*"
                      size="sm"
                      className="input-floating-label-form"
                      value={field.value === 0 ? '' : field.value}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === '' ? 0 : val)
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gross"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Gross"
                      type="text"
                      pattern="[0-9]*"
                      size="sm"
                      className="input-floating-label-form"
                      value={field.value === 0 ? '' : field.value}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === '' ? 0 : val)
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center gap-3 justify-between">
            <FormField
              control={form.control}
              name="bid_premium"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Bid Premium"
                      type="text"
                      pattern="[0-9]*"
                      size="sm"
                      className="input-floating-label-form"
                      value={field.value === 0 ? '' : field.value}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === '' ? 0 : val)
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ask_premium"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Ask Premium"
                      type="text"
                      pattern="[0-9]*"
                      size="sm"
                      className="input-floating-label-form"
                      value={field.value === 0 ? '' : field.value}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === '' ? 0 : val)
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </TabsContent>
        <TabsContent value="dev" className="space-y-8">
          <div className="flex items-center justify-between gap-3">
            <FormField
              control={form.control}
              name="shadow_offset"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Shadow Offset"
                      type="text"
                      pattern="[0-9]*"
                      size="sm"
                      className="input-floating-label-form"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="variant_group"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Variant Group"
                      type="text"
                      size="sm"
                      className="input-floating-label-form"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="display"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg p-3 shadow-lg bg-card">
                <FormLabel className="text-sm font-medium">Display Product?</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </TabsContent>
        <Button
          type="submit"
          variant="default"
          className="w-full"
          disabled={!form.formState.isValid}
        >
          {creatingNew ? 'Add Product' : 'Update'}
        </Button>
      </Tabs>
    </>
  )
}
