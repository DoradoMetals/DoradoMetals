'use client'

import { useLoadScript, GoogleMap, Marker } from '@react-google-maps/api'
import { useEffect, useMemo, useState } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { useFedExLocations } from '@/lib/queries/shipping/useFedex'
import { formatFedexPickupAddress, FedexLocation } from '@/types/shipping'
import { Button } from '@/components/ui/button'
import formatPhoneNumber from '@/utils/formatPhoneNumber'

const containerStyle = {
  width: '100%',
  height: '200px',
}

export const FedexLocationsMap = () => {
  const address = usePurchaseOrderCheckoutStore((state) => state.data.address)
  const input = address
    ? {
        customerAddress: formatFedexPickupAddress(address),
        radiusMiles: 50,
        maxResults: 50,
      }
    : null

  const { data } = useFedExLocations(input)
  const [selected, setSelected] = useState<FedexLocation | null>(null)

  const center = useMemo(() => {
    return {
      lat: data?.matchedAddressGeoCoord?.latitude ?? 32.7767,
      lng: data?.matchedAddressGeoCoord?.longitude ?? -96.797,
    }
  }, [data?.matchedAddressGeoCoord])

  const [icons, setIcons] = useState<{
    defaultIcon: google.maps.Symbol | undefined
    selectedIcon: google.maps.Symbol | undefined
  }>({
    defaultIcon: undefined,
    selectedIcon: undefined,
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.google) {
      const getCssVar = (name: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim()

      setIcons({
        defaultIcon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: getCssVar('--secondary'),
          fillOpacity: 1,
          strokeWeight: 1,
          strokeColor: '#fff',
        },
        selectedIcon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: getCssVar('--primary'),
          fillOpacity: 1,
          strokeWeight: 1,
          strokeColor: '#fff',
        },
      })
    }
  }, [])

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div className="bg-card w-full p-4">
        <h2 className="text-lg text-neutral-800">Dropoff Store Locator</h2>
      </div>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={12}
        options={{
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          styles: nightModeMapStyle,
        }}
      >
        {data?.locations.map((loc) => (
          <Marker
            key={loc.locationId}
            position={{
              lat: loc.geoPositionalCoordinates.latitude,
              lng: loc.geoPositionalCoordinates.longitude,
            }}
            onClick={() => setSelected(loc)}
            icon={selected?.locationId === loc.locationId ? icons.selectedIcon : icons.defaultIcon}
          />
        ))}
      </GoogleMap>

      {selected &&
        (() => {
          const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
          const todayHours = selected.operatingHours?.[today]
          const street = selected.address.streetLines.join(' ')
          const cityState = `${selected.address.city}, ${selected.address.stateOrProvinceCode}`
          const zip = selected.address.postalCode

          const { isOpen, openUntil, nextOpenTime } = getOpenStatus(todayHours)

          return (
            <div className="rounded-lg bg-card text-card-foreground p-3 border-t border-border flex flex-col">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold">
                  {selected.contact?.companyName || 'FedEx Location'}
                </h3>
                <span className="text-sm text-neutral-800 whitespace-nowrap">
                  {selected.distance.value?.toFixed(2)} {selected.distance.units?.toLowerCase()}
                </span>
              </div>

              <div className="flex items-center w-full justify-between">
                <span className="text-neutral-600 text-sm">
                  {formatPhoneNumber(selected.contact.phoneNumber)}
                </span>
                <div className="text-sm text-neutral-600">{cityState}</div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span>
                  {isOpen ? (
                    <div className="flex items-center">
                      <span className="text-green-500">
                        Open<span className="text-neutral-700"> until {openUntil}</span>
                      </span>
                    </div>
                  ) : nextOpenTime ? (
                    <div className="flex items-end">
                      <span className="text-red-500">
                        Closed<span className="text-neutral-700"> until {nextOpenTime}</span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-red-500">Closed</span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openInMaps(selected)}
                  className="text-primary font-medium ml-auto p-0"
                >
                  Open in Maps
                </Button>
              </div>
            </div>
          )
        })()}
    </div>
  )
}

function openInMaps(selected: FedexLocation) {
  const { address } = selected
  const addressStr = `${address.streetLines.join(' ')}, ${address.city}, ${
    address.stateOrProvinceCode
  } ${address.postalCode}`
  const encoded = encodeURIComponent(addressStr)

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const isAndroid = /Android/.test(navigator.userAgent)

  const url = isIOS
    ? `http://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`

  window.open(url, '_blank', 'noopener,noreferrer')
}

function formatTime(t: string) {
  return new Date(`1970-01-01T${t}`).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getOpenStatus(hours?: string) {
  console.log(hours)

  if (!hours || hours === 'Closed') return { isOpen: false, openUntil: null, nextOpenTime: null }

  const [start, end] = hours.split(' - ')
  const now = new Date()
  const startDate = new Date(now)
  const endDate = new Date(now)

  const [startHour, startMin] = start.split(':').map(Number)
  const [endHour, endMin] = end.split(':').map(Number)

  startDate.setHours(startHour, startMin, 0)
  endDate.setHours(endHour, endMin, 0)
  const isOpen = now >= startDate && now <= endDate
  return {
    isOpen,
    openUntil: formatTime(end),
    nextOpenTime: formatTime(start),
  }
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export const nightModeMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
]
