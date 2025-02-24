import { Card, CardHeader, CardBody, CardFooter } from "@heroui/card";
import { Button, Divider, Image, Chip } from "@heroui/react";
import { Product } from "@/types";
import { useState } from "react";
import { MinusIcon, PlusIcon } from "../icons"; // Import the icons

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {

  const [quantity, setQuantity] = useState(1);
  return (
    <div className="flex justify-center p-4">
      <Card className="w-[400px] h-auto shadow-lg rounded-2xl border border-gray-200">
        <CardHeader className="pb-2 flex items-center justify-between px-4">
          <p className="text-lg font-semibold text-gray-800">{product.name}</p>
          <Chip
            className={`text-sm px-3 py-1 font-medium ${product.availability ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
          >
            {product.availability ? "In Stock" : "Out of Stock"}
          </Chip>
        </CardHeader>
        <div className="px-4 -mt-2">
          <p className="text-sm text-gray-500">{product.code}</p>
        </div>

        <Divider />

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

        <Divider />

        <CardFooter className="flex justify-center items-center gap-1 pt-2">
          <button
            className="p-1 rounded-lg hover:bg-gray-100 transition"
            onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
          >
            <MinusIcon />
          </button>
          <input
            type="number"
            className="w-12 text-center border rounded-md p-1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />
          <button
            className="p-1 rounded-lg hover:bg-gray-100 transition"
            onClick={() => setQuantity((prev) => prev + 1)}
          >
            <PlusIcon />
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
