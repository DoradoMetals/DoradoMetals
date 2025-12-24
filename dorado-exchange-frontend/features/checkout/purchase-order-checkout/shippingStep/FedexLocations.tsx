'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { useFedExLocations } from '@/features/fedex/queries'
import { formatFedexPickupAddress } from '@/features/fedex/types'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { formatPickupTime } from '@/shared/utils/formatDates'
import { GoogleMapDisplay, MarkerType } from '@/shared/ui/GoogleMapDisplay'

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

  useEffect(() => {
    if (!selectedId && data?.locations?.length) setSelectedId(data.locations[0].locationId)
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
    userIcon: google.maps.Symbol | undefined
  }>({
    defaultIcon: undefined,
    selectedIcon: undefined,
    userIcon: undefined,
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.google) return

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
      userIcon: {
        path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 5,
        fillColor: '#EA4335',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff',
      },
    })
  }, [])

  const userMarker: MarkerType | undefined = useMemo(() => {
    if (!data?.matchedAddressGeoCoord) return undefined
    return {
      id: 'user',
      title: 'Your location',
      position: {
        lat: data.matchedAddressGeoCoord.latitude,
        lng: data.matchedAddressGeoCoord.longitude,
      },
      icon: icons.userIcon,
    }
  }, [data?.matchedAddressGeoCoord, icons.userIcon])

  const markers: MarkerType[] = useMemo(() => {
    return (data?.locations ?? []).map((loc) => ({
      id: loc.locationId,
      position: {
        lat: loc.geoPositionalCoordinates.latitude,
        lng: loc.geoPositionalCoordinates.longitude,
      },
      icon: selected?.locationId === loc.locationId ? icons.selectedIcon : icons.defaultIcon,
      title: loc.contact?.companyName || 'FedEx Location',
    }))
  }, [data?.locations, icons.defaultIcon, icons.selectedIcon, selected?.locationId])

  return (
    <div className="rounded-lg overflow-hidden border border-border raised-off-page">
      <div className="bg-card w-full p-4" />

      <GoogleMapDisplay
        center={center}
        zoom={12}
        markers={markers}
        selectedId={selected?.locationId ?? null}
        onMarkerClick={(id) => setSelectedId(id)}
        showUserMarker={!!userMarker}
        userMarker={userMarker}
      />

      {data?.locations?.length ? (
        selected ? (
          <FedexLocationDetailsCard selected={selected} />
        ) : null
      ) : (
        <div className="rounded-lg bg-card text-card-foreground p-4 border-t border-border text-sm text-center text-muted-foreground">
          No nearby FedEx locations found.
        </div>
      )}
    </div>
  )
}

function FedexLocationDetailsCard({ selected }: { selected: any }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  const todayHours = selected.operatingHours?.[today]

  const cityState = `${selected.address.city}, ${selected.address.stateOrProvinceCode}`

  const { isOpen, openUntil, nextOpenTime } = getOpenStatus(todayHours)

  const mapsQuery = encodeURIComponent(
    [
      selected.contact?.companyName,
      ...(selected.address?.streetLines ?? []),
      selected.address?.city,
      selected.address?.stateOrProvinceCode,
      selected.address?.postalCode,
      selected.address?.countryCode === 'US' ? 'United States' : selected.address?.countryCode,
    ]
      .filter(Boolean)
      .join(', ')
      .replace(/\s+/g, ' ')
  )

  const mapsHref = /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? `http://maps.apple.com/?q=${mapsQuery}`
    : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

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
            <span className="text-green-500">
              Open<span className="text-neutral-700"> until {openUntil}</span>
            </span>
          ) : nextOpenTime ? (
            <span className="text-red-500">
              Closed<span className="text-neutral-700"> until {nextOpenTime}</span>
            </span>
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
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-normal ml-auto p-0 text-sm"
        >
          Open in Maps
        </a>
      </div>
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
