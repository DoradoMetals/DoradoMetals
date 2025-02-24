
import DefaultLayout from "@/layouts/default";
import ProductCarousel from "@/components/products/ProductCarousel";

export default function IndexPage() {
  return (
    <DefaultLayout>
      <div className="grid grid-nogutter">
        <ProductCarousel />
      </div>
    </DefaultLayout>
  );
}
