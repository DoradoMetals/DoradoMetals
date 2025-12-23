'use client'

import { LoadScript } from '@react-google-maps/api'
import type { Libraries } from '@react-google-maps/api'

const libraries: Libraries = ['places']

export default function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  return (
    <LoadScript
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
      libraries={libraries}
      version="beta"
      loadingElement={<div className="hidden" />}
    >
      {children}
    </LoadScript>
  )
}
