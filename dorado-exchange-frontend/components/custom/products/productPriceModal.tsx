"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpotPrice } from "@/lib/queries/useSpotPrices";
import { Product } from "@/types/product";

export default function ProductPriceModal({ product, open, setOpen, title }: { 
  product: Product;
  spot: SpotPrice
  open: boolean; 
  setOpen: (open: boolean) => void; 
  title: string
}) {
  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle className="mb-4">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center">
          {product.price}
        </div>
      </DialogContent>
    </Dialog>
  );
}