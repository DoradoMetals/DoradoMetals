import { Card, CardHeader, CardBody, CardFooter } from "@heroui/card";
import { Button, Divider, Image, Chip, NumberInput } from "@heroui/react";
import { Product } from "@/types";
import { useState } from "react";
import { MinusIcon, PlusIcon } from "../icons"; // Import the icons

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {

  return (
    <div className="flex justify-center p-4">
      <Card className="w-[400px] h-auto shadow-lg rounded-2xl">
        <CardHeader className="pb-2 flex items-center justify-between px-4">
          <p className="text-lg font-semibold">{product.name}</p>
          <Chip
          className={`text-sm px-3 py-1 font-medium ${product.availability ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {product.availability ? "In Stock" : "Out of Stock"}
          </Chip>
        </CardHeader>
        <div className="px-4 mt-2">
          <p className="text-sm">{product.product_code}</p>
        </div>

        <CardBody className="flex justify-center p-4">
          <Image
            className="rounded-lg object-cover"
            height={300}
            width={300}
            radius="sm"
            src={product.image}
            alt={product.name}
          />
        </CardBody>

        <CardFooter>
          <div className="grid justify-items-center place-items-center grid-cols-3 grid-rows-2 gap-y-2">
            <div className="row-start-1 col-start-1">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                className="rounded-lg"
                // onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
              >
                <MinusIcon className="w-5 h-5" />
              </Button>
            </div>
            <div className="row-start-1 col-start-2">
              <NumberInput
                classNames={{
                  label: "",
                  input: [
                    "bg-transparent",
                    "text-center",
                    "text-xl"
                  ],

                }}
                hideStepper
                variant={"underlined"}
                // value={quantity}
              />
            </div>
            <div className="row-start-1 col-start-3">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                className="rounded-lg"
                // onClick={() => setQuantity((prev) => prev + 1)}
              >
                <PlusIcon className="w-5 h-5" />
              </Button>
            </div>
            <div className="row-start-2 col-start2 col-end-3">
              <Button className="bg-primary">
                Add to Cart
              </Button>
            </div>

          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
