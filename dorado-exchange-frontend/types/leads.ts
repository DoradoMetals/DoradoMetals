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
}

export interface NewLead {
  name: string,
  phone: string,
  email?: string,
  created_by: string,
  updated_by: string,
}

export type LeadCard = 'Converted' | 'Responded' | 'Contacted' | null

export interface LeadsStats {
  totalLeads: number
  respondedCount: number
  convertedCount: number
  contactedCount?: number
}