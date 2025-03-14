"use client";

import Image from "next/image";
import React from "react";
import { Product } from "@/types";
import { CardContainer, CardBody, CardItem } from "@/components/ui/3d-card";
import { Button } from "@/components/ui/button";

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <CardContainer className="p-3">
      <CardBody className="bg-gray-50 relative group/card hover:shadow-2xl hover:shadow-primary/[0.3] dark:bg-black dark:border-white/[0.2] border-black/[0.1] w-full sm:w-[30rem] h-auto rounded-xl p-6 border">
        <CardItem
          // translateZ="50"
          className="text-xl font-bold text-neutral-600 dark:text-white"
        >
          {product.product_name}
        </CardItem>
        <CardItem translateZ="100" className="w-full overflow-hidden">
          <Image
            src={product.image_front}
            // layout="responsive"
            width={500}
            height={500} // Adjust height dynamically
            className="w-full h-full object-contain"
            alt="thumbnail"
          />
        </CardItem>

        <CardItem
          as="p"
          // translateZ="60"
          className="text-neutral-500 text-sm max-w-sm mt-2 dark:text-neutral-300"
        >
          {product.product_description}
        </CardItem>
        <div className="flex justify-between items-center">
          <CardItem
            // translateZ={20}
            className="px-4 py-2 rounded-xl text-xs font-normal dark:text-white"
          >
            {product.product_type}
          </CardItem>
          <CardItem
            // translateZ={20}
            className=""
          >
            <Button variant="default" className="px-4 py-2 text-xs font-bold">
              Add to Cart
            </Button>
          </CardItem>
        </div>
      </CardBody>
    </CardContainer>
  );
}
