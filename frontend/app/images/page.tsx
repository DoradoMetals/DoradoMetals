'use client'

import { useTestImage, useDeleteImage } from '@/features/media/queries'
import { ImageUpload } from '@/features/media/ui/ImageUpload'
import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { Button } from '@/shared/ui/base/button'
import { protectedRoutes } from '@/features/routes/types'

export default function Page() {
  const { data: imgs = [], isLoading } = useTestImage()
  const del = useDeleteImage()

  return (
    <ProtectedPage requiredRoles={protectedRoutes.images.roles}>
      <main className="p-6 space-y-6">
        <h1>Image Test</h1>

        <ImageUpload path={'/test/'} />

        {isLoading && <p>Loading…</p>}
        {!isLoading && imgs.length === 0 && <p>No images yet</p>}

        <ul className="grid grid-cols-4 gap-4">
          {imgs?.map((img) => (
            <li key={img.id} className="space-y-2">
              <img src={img.url} className="h-24 w-24 object-cover rounded-lg" />
              <small className="break-all">{img.filename}</small>
              <Button
                variant="tertiary"
                intent="danger"
                size="xs"
                onClick={() => del.mutate(img.id)}
              >
                delete
              </Button>
            </li>
          ))}
        </ul>
      </main>
    </ProtectedPage>
  )
}
