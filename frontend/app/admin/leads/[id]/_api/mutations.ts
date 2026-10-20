'use client'

import {
  useAddEstimateItem,
  useArchiveLead,
  useAttachEstimateItemImages,
  useLeadDocumentUrl,
  usePatchLead,
  useRemoveEstimateItems,
  useRestoreLead,
  useSendLeadDocument,
  useSendLeadMessage,
  useUploadImage,
} from '@dorado/client'

export const usePatch = (id: string) => usePatchLead(id)

export const useArchive = () => useArchiveLead()

export const useRestore = () => useRestoreLead()

export const useAddItem = (id: string) => useAddEstimateItem(id)

export const useRemoveItems = (id: string) => useRemoveEstimateItems(id)

export const useAttachImages = (id: string) => useAttachEstimateItemImages(id)

export const useUploadPhoto = () => useUploadImage()

export const useSendText = (id: string) => useSendLeadMessage(id)

export const useSendDocument = (id: string) => useSendLeadDocument(id)

export const useDocumentUrl = (id: string) => useLeadDocumentUrl(id)
