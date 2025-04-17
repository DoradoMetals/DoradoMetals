'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useFedExLocations } from '@/lib/queries/shipping/useFedex'
import { formatFedexPickupAddress, FedexLocations } from '@/types/shipping'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export const FedexLocationsList = () => {
  const address = usePurchaseOrderCheckoutStore((state) => state.data.address)
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)

  const radiusOptions = [10, 25, 50]
  const [radiusMiles, setRadiusMiles] = useState(25)
  const [maxResults] = useState(50)

  const input = address
    ? {
        customerAddress: formatFedexPickupAddress(address),
        radiusMiles,
        maxResults,
      }
    : null

  const { data, isLoading, isError } = useFedExLocations(input)

  if (!input) return null

  return (
    <div>
      {pickup?.label === 'DROPOFF_AT_FEDEX_LOCATION' && (
        <div className="flex flex-col gap-2 bg-card rounded-lg border-1 border-border">
          <div className="flex flex-col align-start">
            <div className="text-base p-3 font-semibold text-neutral-800">FedEx Dropoff Locations</div>

            <div className="flex justify-start items-center border-b border-border h-8 px-3">
              <RadioGroup
                value={String(radiusMiles)}
                onValueChange={(val) => setRadiusMiles(Number(val))}
                className="flex items-center justify-start"
              >
                {radiusOptions.map((miles, index) => (
                  <div
                    key={miles}
                    className={cn(
                      'flex items-center'
                      // index !== radiusOptions.length - 1 && 'border-r border-border'
                    )}
                  >
                    <label
                      htmlFor={`radius-${miles}`}
                      className="cursor-pointer text-xs font-medium text-neutral-500 
              has-[[data-state=checked]]:text-neutral-700 
              has-[[data-state=checked]]:font-semibold"
                    >
                      <RadioGroupItem
                        value={String(miles)}
                        id={`radius-${miles}`}
                        className="sr-only"
                      />
                      {miles} mi
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <ScrollArea className="h-64 border-border sm:border-s">
            {data?.map((location: FedexLocations) => {
              const today = new Date()
                .toLocaleDateString('en-US', {
                  weekday: 'long',
                })
                .toUpperCase()

              const todayHours = location.operatingHours?.[today] || 'Closed'
              const isOpen = todayHours !== 'Closed'

              const formattedPhone = formatPhone(location.contact?.phoneNumber)
              const street = location.address.streetLines.join(' ')
              const cityStateZip = `${location.address.city}, ${location.address.stateOrProvinceCode} ${location.address.postalCode}`

              return (
                <div
                  key={location.locationId}
                  className="space-y-1 px-2 py-3 border-b-1 border-border"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-semibold">
                      {location.contact?.companyName || 'FedEx Location'}
                    </h3>
                    <span className="text-xs text-neutral-500 whitespace-nowrap">
                      ({location.distance.value?.toFixed(3)}{' '}
                      {location.distance.units?.toLowerCase()})
                    </span>
                  </div>

                  <div
                    className={cn(
                      'flex items-end gap-2 text-sm text-neutral-700 justify-between',
                      !formattedPhone && 'mb-4'
                    )}
                  >
                    <span>{formatHours(todayHours)}</span>
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        isOpen ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-600'
                      )}
                    >
                      {isOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>

                  {formattedPhone && (
                    <div className="text-xs text-neutral-500 mb-4">{formattedPhone}</div>
                  )}
                  <div className="text-sm text-neutral-600">
                    {street}, {cityStateZip}
                  </div>
                </div>
              )
            })}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

function formatHours(raw: string) {
  if (!raw.includes(':')) return raw
  const [start, end] = raw.split(' - ')
  return `${formatTime(start)} - ${formatTime(end)}`
}

function formatTime(t: string) {
  return new Date(`1970-01-01T${t}Z`).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatPhone(raw?: string) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 ? digits.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2 - $3') : raw
}
