'use client'

import { GoogleMap, Marker } from '@react-google-maps/api'
import { useMemo } from 'react'

export type LatLng = { lat: number; lng: number }

export type MarkerType = {
  id: string
  position: LatLng
  title?: string
  icon?: google.maps.Icon | google.maps.Symbol
}

const defaultContainerStyle = { width: '100%', height: '225px' }

export function GoogleMapDisplay({
  center,
  zoom = 12,
  height = 225,
  markers = [],
  selectedId,
  onMarkerClick,
  showUserMarker,
  userMarker,
  options,
  mapStyle = nightModeMapStyle,
  className,
}: {
  center: LatLng
  zoom?: number
  height?: number
  markers?: MarkerType[]
  selectedId?: string | null
  onMarkerClick?: (id: string) => void
  showUserMarker?: boolean
  userMarker?: MarkerType
  options?: google.maps.MapOptions
  mapStyle?: google.maps.MapTypeStyle[]
  className?: string
}) {
  const containerStyle = useMemo(
    () => ({ ...defaultContainerStyle, height: `${height}px` }),
    [height]
  )

  return (
    <div className={className}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        options={{
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          styles: mapStyle,
          ...options,
        }}
      >
        {showUserMarker && userMarker && (
          <Marker position={userMarker.position} icon={userMarker.icon} title={userMarker.title} />
        )}

        {markers.map((m) => (
          <Marker
            key={m.id}
            position={m.position}
            title={m.title}
            icon={m.icon}
            onClick={onMarkerClick ? () => onMarkerClick(m.id) : undefined}
          />
        ))}
      </GoogleMap>
    </div>
  )
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
