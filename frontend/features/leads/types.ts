export type LeadPriority = 'High' | 'Medium' | 'Low'

export const LEAD_PRIORITIES: LeadPriority[] = ['High', 'Medium', 'Low']

export interface Lead {
  id: string
  name: string
  phone: string
  email: string
  created_at: Date
  updated_at: Date
  created_by: string
  updated_by: string
  last_contacted?: Date | null
  converted: boolean
  contacted: boolean
  responded: boolean
  contact: string
  notes?: string
  priority: LeadPriority
}

export interface NewLead {
  name: string,
  phone: string,
  email?: string,
  created_by: string,
  updated_by: string,
  priority: LeadPriority,
  notes?: string,
}
