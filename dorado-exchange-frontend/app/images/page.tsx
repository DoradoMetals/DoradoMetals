'use client'

import { useTestImage, useDeleteImage } from '@/lib/queries/useImages'
import { ImageUpload } from '@/features/media/ui/ImageUpload'
import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { protectedRoutes } from '@/types/routes'

export default function Page() {
  const { data: imgs = [], isLoading } = useTestImage()
  const del = useDeleteImage()

  return (
    <ProtectedPage requiredRoles={protectedRoutes.images.roles}>
      <div className="p-6 space-y-6">
        <h1 className="text-xl font-semibold">Image Test</h1>

        <ImageUpload path={'/test/'} />

        {isLoading && <div>Loading…</div>}
        {!isLoading && imgs.length === 0 && <div>No images yet</div>}

        <ul className="grid grid-cols-4 gap-4">
          {imgs?.map((img) => (
            <li key={img.id} className="space-y-2">
              <img src={img.url} className="h-24 w-24 object-cover rounded" />
              <div className="text-xs break-all">{img.filename}</div>
              <button className="text-red-500 text-xs" onClick={() => del.mutate(img.id)}>
                delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ProtectedPage>
  )
}
