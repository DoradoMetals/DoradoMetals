import { useState } from "react";
import PurchaseOrderCards from "./purchaseOrderCards";
import PurchaseOrdersTable from "./purchaseOrdersTable";

export default function AdminPurchaseOrders() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <PurchaseOrderCards selectedStatus={selectedStatus} setSelectedStatus={setSelectedStatus}/>
      <PurchaseOrdersTable selectedStatus={selectedStatus} />
    </div>
  )
}