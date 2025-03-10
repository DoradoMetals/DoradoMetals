"use client";

import { apiRequest } from "@/utils/axiosInstance";
import { Product } from "@/types";
import { useEffect, useState } from "react";
import ProductCard from "@/components/custom/products/productcard";

export default function Page() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  
  

  useEffect(() => {
    const getProducts = async () => {
      setLoading(true); // Ensure loading state starts before fetching
      try {
        const data = await apiRequest<Product[]>("GET", "/products/get_products", undefined, { category: "gold" });
        setProducts(data); // Ensure data is properly set
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false); // Ensure loading state is updated even on error
      }
    };

    getProducts();
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
