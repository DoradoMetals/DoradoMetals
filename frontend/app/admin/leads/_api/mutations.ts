'use client'

import {
  useArchiveLeads,
  useAssignLeads,
  useCreateLead,
  useExportLeads,
  useRestoreLeads,
} from '@dorado/client'

export const useCreate = () => useCreateLead()

export const useAssign = () => useAssignLeads()

export const useArchiveMany = () => useArchiveLeads()

export const useRestoreMany = () => useRestoreLeads()

export const useExport = () => useExportLeads()
