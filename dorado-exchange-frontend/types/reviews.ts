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

export interface ReviewStats{
  totalReviews: number
  averageRating: number
  reviewPercentage: number
}