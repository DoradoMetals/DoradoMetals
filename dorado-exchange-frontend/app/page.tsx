'use client'

// import { useShipments } from '@/lib/queries/shipping/useShipments'
// import Image from 'next/image'

export default function Home() {
  // const order_id = '139841bb-ce78-45c3-8c17-04cf5d0d6c49'
  // const { data: shipments, isLoading } = useShipments(order_id)
  // function base64ToBlob(base64: string, mime = 'application/pdf') {
  //   const binary = atob(base64)
  //   const len = binary.length
  //   const bytes = new Uint8Array(len)
  //   for (let i = 0; i < len; i++) {
  //     bytes[i] = binary.charCodeAt(i)
  //   }
  //   return new Blob([bytes], { type: mime })
  // }
  return (
    <div className="flex flex-col items-center gap-4">
      {/* {shipments?.map((shipment) => {
        if (!shipment.shipping_label) return null

        const blob = base64ToBlob(shipment.shipping_label)
        console.log(blob.type) // Should be 'application/pdf'

        const url = URL.createObjectURL(blob)

        return (
          <div key={shipment.id}>
            <button
              onClick={() => {
                const blob = base64ToBlob(shipment.shipping_label ?? '')
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `shipment-${shipment.id}.png`
                a.click()
              }}
            >
              Download Label
            </button>
            <Image 
              src={`data:image/png;base64,${shipment.shipping_label}`}
              alt='not found'
              height={300}
              width={300}
            />
          </div>
        )
      })} */}
    </div>
  )
}
