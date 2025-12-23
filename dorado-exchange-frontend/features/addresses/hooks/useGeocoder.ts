'use client'

import { useEffect, useState } from 'react'
import { useDebouncedValue } from '@/shared/hooks/useDebounce'
import { LatLng } from '@/shared/ui/GoogleMapDisplay'

export function useGeocodeAddress({
  enabled,
  query,
  debounceMs = 300,
}: {
  enabled: boolean
  query: string
  debounceMs?: number
}) {
  const [center, setCenter] = useState<LatLng | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const debounced = useDebouncedValue(query, debounceMs)

  useEffect(() => {
    if (!enabled || !debounced?.trim()) {
      setCenter(null)
      return
    }
    if (!window.google?.maps?.Geocoder) return

    const geocoder = new window.google.maps.Geocoder()
    setIsGeocoding(true)

    geocoder.geocode({ address: debounced }, (results, status) => {
      setIsGeocoding(false)
      if (status !== 'OK' || !results?.[0]) {
        setCenter(null)
        return
      }
      const loc = results[0].geometry.location
      setCenter({ lat: loc.lat(), lng: loc.lng() })
    })
  }, [enabled, debounced])

  return { center, isGeocoding }
}
