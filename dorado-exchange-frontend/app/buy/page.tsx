"use client";

import axiosInstance from "@/utils/axiosInstance";
import { Product } from "@/types";
import { useEffect, useState } from "react";
import ProductCard from "@/components/custom/products/productcard";

export default function Page() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data } = await axiosInstance.get<Product[]>("/products/get_products");
        setProducts(data);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  return (
    <div className="flex-col gap-3">
      {
        loading
          ?
          null
          :
          <>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </>
      }
    </div>
  );
}
