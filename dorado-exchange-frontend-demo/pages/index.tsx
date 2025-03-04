
import DefaultLayout from "@/layouts/default";
import ProductCarousel from "@/components/products/ProductCarousel";
import UnderConstruction from "@/components/landing/UnderConstruction";

export default function IndexPage() {
  return (
    <DefaultLayout>
      <div className="">
        <UnderConstruction />
      </div>
    </DefaultLayout>
  );
}
