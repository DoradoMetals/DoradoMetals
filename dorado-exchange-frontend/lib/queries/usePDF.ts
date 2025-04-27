import { apiRequest, pdfRequest } from "@/utils/axiosInstance";
import { PurchaseOrder } from "@/types/purchase-order";
import { useFormatPurchaseOrderNumber } from "@/utils/formatPurchaseOrderNumber";
import { SpotPrice } from "./useSpotPrices";
import { useMutation } from "@tanstack/react-query";

const downloadPackingListRequest = async ({
  purchaseOrder,
  spotPrices,
}: {
  purchaseOrder: PurchaseOrder;
  spotPrices: SpotPrice[];
}) => {
  const blob = await pdfRequest<Blob>(
    'POST',
    '/pdf/generate_packing_list',
    { purchaseOrder, spotPrices }
  );

  const url = URL.createObjectURL(blob);
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber();
  const link = document.createElement('a');
  link.href = url;
  link.download = `${formatPurchaseOrderNumber(purchaseOrder.order_number)}_packing_list.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const useDownloadPackingList = () => {
  return useMutation({
    mutationFn: downloadPackingListRequest,
  });
};