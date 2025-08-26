export interface Lead {
  id: string
  name: string
  phone: string
  email: string
  created_at: Date
  updated_at: Date
  created_by: string
  updated_by: string
  last_contacted: Date
  converted: boolean
  contacted: boolean
  responded: boolean
  contacted_by: string
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