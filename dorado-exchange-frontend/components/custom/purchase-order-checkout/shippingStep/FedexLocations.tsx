'use client'

import { GoogleMap, Marker } from '@react-google-maps/api'
import { useEffect, useMemo, useState } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { useFedExLocations } from '@/lib/queries/useFedex'
import { formatFedexPickupAddress } from '@/types/fedex'
import formatPhoneNumber from '@/utils/formatting/formatPhoneNumber'
import { formatPickupTime } from '@/utils/formatting/dateFormatting'

const containerStyle = {
  width: '100%',
  height: '225px',
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => {
    if (!data?.locations?.length) return null
    return data.locations.find((loc) => loc.locationId === selectedId) ?? data.locations[0]
  }, [data?.locations, selectedId])

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
    <div className="rounded-lg overflow-hidden border border-border raised-off-page">
      <div className="bg-card w-full p-4">
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
        {data?.matchedAddressGeoCoord && (
          <>
            <Marker
              position={{
                lat: data.matchedAddressGeoCoord.latitude,
                lng: data.matchedAddressGeoCoord.longitude,
              }}
              icon={{
                path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                scale: 5,
                fillColor: '#EA4335',
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: '#ffffff',
              }}
              title="Your location"
            />
          </>
        )}
        {data?.locations.map((loc) => (
          <Marker
            key={loc.locationId}
            position={{
              lat: loc.geoPositionalCoordinates.latitude,
              lng: loc.geoPositionalCoordinates.longitude,
            }}
            onClick={() => setSelectedId(loc.locationId)}
            icon={selected?.locationId === loc.locationId ? icons.selectedIcon : icons.defaultIcon}
          />
        ))}
      </GoogleMap>

      {data?.locations?.length ? (
        selected &&
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

              <div className="flex items-center w-full justify-between mt-1">
                <span className="text-sm">
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
                <div className="text-sm text-neutral-600">{cityState}</div>
              </div>

              <div className="flex justify-between items-center text-sm mt-4">
                <span className="text-neutral-600 text-sm">
                  <a
                    href={`tel:${selected.contact.phoneNumber}`}
                    className="text-neutral-700 underline underline-offset-3 text-sm"
                  >
                    {formatPhoneNumber(selected.contact.phoneNumber)}
                  </a>
                </span>

                <a
                  href={
                    /iPhone|iPad|iPod/.test(navigator.userAgent)
                      ? `http://maps.apple.com/?q=${encodeURIComponent(
                          [
                            selected.contact.companyName,
                            ...selected.address.streetLines,
                            selected.address.city,
                            selected.address.stateOrProvinceCode,
                            selected.address.postalCode,
                            selected.address.countryCode === 'US'
                              ? 'United States'
                              : selected.address.countryCode,
                          ]
                            .filter(Boolean)
                            .join(', ')
                            .replace(/\s+/g, ' ')
                        )}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          [
                            selected.contact.companyName,
                            ...selected.address.streetLines,
                            selected.address.city,
                            selected.address.stateOrProvinceCode,
                            selected.address.postalCode,
                            selected.address.countryCode === 'US'
                              ? 'United States'
                              : selected.address.countryCode,
                          ]
                            .filter(Boolean)
                            .join(', ')
                            .replace(/\s+/g, ' ')
                        )}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-normal ml-auto p-0 text-sm"
                >
                  Open in Maps
                </a>
              </div>
            </div>
          )
        })()
      ) : (
        <div className="rounded-lg bg-card text-card-foreground p-4 border-t border-border text-sm text-center text-muted-foreground">
          No nearby FedEx locations found.
        </div>
      )}
    </div>
  )
}

function getOpenStatus(hours?: string) {
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
    openUntil: formatPickupTime(end),
    nextOpenTime: formatPickupTime(start),
  }
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
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.attraction',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.place_of_worship',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.medical',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.school',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.sports_complex',
    stylers: [{ visibility: 'off' }],
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
