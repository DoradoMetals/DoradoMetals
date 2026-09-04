"use client";

// THE IMAGES SURFACE. media.images plus the object store's presigned URLs -
// see api/transport/media/images/routes.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Image as ImageContract } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// What a read adds on top of the row: a presigned GET url. Not a table
// column, so it is not in @dorado/contracts.
export type Image = ImageContract & { url: string };

// The upload flow's own request/response shapes - request/response bodies of
// POST /images, not rows, so they stay local to this package rather than in
// @dorado/contracts.
export type ImageUpload = { path?: string; file: File };
export type ImageUploadReturn = { id: string; uploadUrl: string };

// GET /api/images - admin only, EVERY image in the system with a presigned
// download link attached to each one. Behind requireUser this once let any
// signed-in account enumerate and download every customer's photo; the route
// is requireAdmin now, and this hook is only ever mounted behind an admin
// page.
export function useImages() {
  return useQuery<Image[]>({
    queryKey: keys.media.images.all(),
    queryFn: () => apiRequest<Image[]>("GET", "/images"),
  });
}

// POST /api/images -> 201, then a raw PUT. Two network calls because the API
// only mints an id and a presigned upload url - the bytes go straight to
// object storage, so the API server never sees them.
export function useUploadImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }: ImageUpload): Promise<{ id: string }> => {
      const { id, uploadUrl } = await apiRequest<ImageUploadReturn>("POST", "/images", {
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      // A direct PUT to a presigned cloud-storage URL, not a call to our own
      // API - deliberately not apiRequest, and exempt from the "no direct
      // fetch" rule for exactly that reason.
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      return { id };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.media.images.all() });
    },
  });
}

// DELETE /api/images/:id. Removed from the cached list the moment the
// request is sent, restored if it fails.
export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>("DELETE", `/images/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.media.images.all() });
      const previous = queryClient.getQueryData<Image[]>(keys.media.images.all());
      queryClient.setQueryData<Image[]>(keys.media.images.all(), (list) =>
        list?.filter((img) => img.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(keys.media.images.all(), context.previous);
    },
  });
}
