'use client'

import Image from 'next/image'
import { Product } from '@/types'
import { CardContainer, CardBody, CardItem } from '@/components/ui/3d-card'
import { Button } from '@/components/ui/button'
import { useAddToCart, useCart, useRemoveFromCart } from '@/lib/queries/useCart'
import { Minus, Plus } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import {
  Carousel,
  CarouselContent,
  CarouselNavigation,
  CarouselIndicator,
  CarouselItem,
} from '@/components/ui/carousel'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

type ProductCardProps = {
  product: Product
}

export default function ProductCard({ product }: ProductCardProps) {
  const addToCartMutation = useAddToCart(product)
  const removeFromCartMutation = useRemoveFromCart(product)
  const { data: cart = [] } = useCart()

  const productQuantity = cart.filter((item) => item.id === product.id).length

  const items = [
    { value: '1/10', label: '.10 oz', disabled: false },
    { value: '1/4', label: '.25 oz', disabled: false },
    { value: '1/2', label: '.5 oz', disabled: false },
    { value: '1', label: '1 oz', disabled: false },
  ]

  // return (
  //   <CardContainer className="p-3">
  //     <CardBody className="flex-col bg-card relative focus-within:shadow-2xl focus-within:shadow-primary/[0.2] hover:shadow-2xl hover:shadow-primary/[0.2] transition-all duration-300 w-full sm:w-[30rem] h-auto rounded-lg p-6">
  //       <CardItem className="header-text">{product.product_name}</CardItem>

  //       <div className="flex justify-center rounded-lg p-2 transition-all duration-300">
  //         <CardItem translateZ="100" className="w-full overflow-hidden">
  //           <Image
  //             src={product.image_front}
  //             width={100}
  //             height={100}
  //             className="w-full h-full object-contain focus:outline-none"
  //             alt="thumbnail"
  //             tabIndex={0}
  //           />
  //         </CardItem>
  //       </div>

  //       <div className="flex items-center justify-center w-full">
  //         <CardItem className="">
  //           <div className="flex items-center">
  //             <Button
  //               variant="ghost"
  //               className="hover:bg-card"
  //               onClick={() => removeFromCartMutation.mutate()}
  //             >
  //               <Minus size={20} />
  //             </Button>

  //             <div className="">
  //               <NumberFlow
  //                 value={productQuantity}
  //                 transformTiming={{ duration: 750, easing: 'ease-in' }}
  //                 spinTiming={{ duration: 150, easing: 'ease-out' }}
  //                 opacityTiming={{ duration: 350, easing: 'ease-out' }}
  //                 className="title-text text-center font-semibold"
  //                 trend={0}
  //               />
  //             </div>
  //             <Button
  //               variant="ghost"
  //               className="hover:bg-card"
  //               onClick={() => addToCartMutation.mutate()}
  //             >
  //               <Plus size={20} />
  //             </Button>
  //           </div>
  //         </CardItem>
  //       </div>
  //     </CardBody>
  //   </CardContainer>
  // )

  return (
    <div className="bg-card h-[30rem] w-auto sm:w-[20rem] max-w-[20rem] mx-5 my-5 rounded-lg border-t-3 border-primary shadow-xl">
      <div className="flex-col items-center px-8 py-8">
        <div className="flex items-start">
          <div className="flex-col justify mr-auto">
            <div className="title-text">{product.product_name}</div>
            <div className="secondary-text">{product.product_type}</div>
          </div>
          <div className="primary-text ml-auto">$3,324.21 {/* price placeholder */}</div>
        </div>
        <div>
          <Carousel className='mb-6'>
            <CarouselContent>
              <CarouselItem className="p-4">
                <div className="flex aspect-square items-center justify-center m-0 p-0">
                  <Image
                    src={product.image_front}
                    width={500}
                    height={500}
                    className="pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                    alt="thumbnail"
                    tabIndex={0}
                  />
                </div>
              </CarouselItem>
              <CarouselItem className="p-4">
                <div className="flex aspect-square items-center justify-center m-0 p-0">
                  <Image
                    src={product.image_back}
                    width={500}
                    height={500}
                    className="pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                    alt="thumbnail"
                    tabIndex={0}
                  />
                </div>
              </CarouselItem>
            </CarouselContent>
            <CarouselNavigation alwaysShow />
            <CarouselIndicator />
          </Carousel>
        </div>
        <div className="flex items-center gap-2 justify-center w-full mb-6">
        <RadioGroup className="flex items-center justify-between w-full" defaultValue="1">
        {items.map((item) => (
              <label
                key={`${item.value}`}
                className=" peer h-8 w-13
                            relative flex flex-col
                            items-center text-center justify-center
                            cursor-pointer rounded-lg 
                            border border-neutral-500 
                            text-xs text-neutral-500
                            has-[[data-state=checked]]:text-neutral-800
                            has-[[data-state=checked]]:border-2
                            has-[[data-state=checked]]:border-primary
                            has-[[data-disabled]]:cursor-not-allowed
                            has-[[data-disabled]]:opacity-50"
              >
                <RadioGroupItem
                  id={item.value}
                  value={item.value}
                  className="sr-only after:absolute after:inset-0"
                  disabled={item.disabled}
                />
                <p className="leading-none">{item.label}</p>
              </label>
            ))}
          </RadioGroup>
        </div>
        <Button variant='default' className='w-full mb-6'>
          Add to Cart
        </Button>
      </div>
    </div>
  )
}
