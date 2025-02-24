import { useEffect, useState } from "react";
import axiosInstance from "@/utils/axiosInstance";
import { Product } from "@/types";
import ProductCard from "./ProductCard";
import { Pagination, Spinner, Button } from "@heroui/react";

export default function ProductGrid() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 8;

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

  // Calculate which products to display
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = products.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(products.length / productsPerPage);

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  return (
    <div className="container mx-auto px-4">
      {loading ? (
        // HeroUI Spinner centered while loading
        <div className="flex justify-center items-center h-40">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {currentProducts.length > 0 ? (
              currentProducts.map((product) => <ProductCard key={product.code} product={product} />)
            ) : (
              <p className="text-center col-span-full text-gray-500">No products available</p>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <Button onClick={handlePrev} disabled={currentPage === 1} variant="light">
                ❮ Prev
              </Button>
              <Pagination total={totalPages} page={currentPage} onChange={setCurrentPage} showControls />
              <Button onClick={handleNext} disabled={currentPage === totalPages} variant="light">
                Next ❯
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
