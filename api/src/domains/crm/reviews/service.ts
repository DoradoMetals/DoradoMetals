import withTransaction from '#shared/db/withTransaction.ts'
import * as reviews from '#db/reviews/repo.ts'
import * as rules from '#crm/reviews/rules.ts'
import type { PublicReview, Review, ReviewPatch } from '@dorado/contracts'

export async function getOne(id: string): Promise<Review> {
  const row = await reviews.getOne(id)
  rules.assertReview(row, id)
  return row
}

export async function list(): Promise<Review[]> {
  return await reviews.list()
}

export async function getPublic(): Promise<PublicReview[]> {
  return await reviews.getPublic()
}

export async function create(review: ReviewPatch): Promise<Review> {
  return withTransaction(async (client) => {
    return await reviews.create(review, client)
  })
}

export async function update(id: string, patch: ReviewPatch): Promise<Review> {
  return withTransaction(async (client) => {
    const row = await reviews.update(id, patch, client)
    rules.assertReview(row, id)
    return row
  })
}

export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    return await reviews.remove(id, client)
  })
}
