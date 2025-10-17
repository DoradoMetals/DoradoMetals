export interface Review {
  id: string
  review_text: string
  created_at: Date
  updated_at: Date
  rating: number
  created_by: string
  updated_by: string
  name: string
  hidden: boolean
}

export interface NewReview {
  review_text: string
  rating: number
  created_by: string
  updated_by: string
  name: string
  hidden: boolean
}

export type ReviewCard = '1 Star' | '2 Star' | '3 Star' | '4 Star' | '5 Star' | 'Hidden' | null

export interface ReviewStats {
  totalReviews: number
  averageRating: number
  hiddenCount: number
  publicCount: number
  starCounts: Record<1 | 2 | 3 | 4 | 5, number>
}