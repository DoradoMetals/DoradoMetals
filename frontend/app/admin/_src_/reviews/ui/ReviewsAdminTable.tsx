'use client'

import type { Review } from "@dorado/contracts";
import * as React from 'react'

import { useDrawerStore } from '@/shared/store/drawerStore'

import { DataTable, type DataTableColumn, Rating, RatingButton, Button } from '@dorado/components'
import { EyeOff, Eye, Plus } from '@dorado/icons'
import { useCreateReview, useReviews } from '@/shared/hooks/reviews/queries'
import ReviewsDrawer from './ReviewsDrawer'
import { AddNewDialog, type CreateConfig } from '../../ui/CreateDialog'

export default function ReviewsPage() {
  const { data: reviews = [] } = useReviews()
  const createReview = useCreateReview()
  const { openDrawer } = useDrawerStore()

  const [activeReview, setActiveReview] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const columns: DataTableColumn<Review>[] = React.useMemo(
    () => [
      { accessorKey: 'name', header: 'Name', enableSorting: true },

      {
        id: 'rating',
        header: 'Rating',
        cell: ({ row }) => {
          const rating = Number(row.original.rating) || 0
          return (
            <Rating value={rating} readOnly>
              {Array.from({ length: 5 }).map((_, i) => (
                <RatingButton key={i} size={16} />
              ))}
            </Rating>
          )
        },
      },

      {
        accessorKey: 'review_text',
        header: 'Review',
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[38ch]">{row.original.review_text}</span>
        ),
      },

      {
        id: 'hidden',
        header: 'Visibility',
        cell: ({ row }) =>
          row.original.hidden ? (
            <EyeOff size={24} className="text-destructive" />
          ) : (
            <Eye size={24} className="text-success" />
          ),
      },

      {
        accessorKey: 'created_at',
        header: 'Created',
        enableSorting: true,
        cell: ({ row }) => {
          const raw = row.original.created_at
          if (!raw) return '-'
          return new Date(raw).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        },
      },
    ],
    []
  )

  const createConfig: CreateConfig = React.useMemo(
    (): CreateConfig => ({
      title: 'Create New Review',
      submitLabel: 'Create Review',
      fields: [
        {
          name: 'name',
          label: 'Reviewer Name',
          inputType: 'text',
        },
        {
          name: 'review_text',
          label: 'Review Text',
          multiline: true,
          maxLength: 1000,
        },
        {
          name: 'rating',
          label: 'Rating',
          isRating: true,
        },
      ],
      createNew: (values) => {
        const name = values.name ?? ''
        const reviewText = values.review_text ?? ''
        const rating = Number(values.rating ?? '0') || 0

        createReview.mutate({
          name,
          review_text: reviewText,
          rating,
          hidden: true,
        })
      },
      canSubmit: (values) => {
        const name = (values.name ?? '').trim()
        const reviewText = (values.review_text ?? '').trim()
        const rating = Number(values.rating ?? '0') || 0
        return name !== '' && reviewText !== '' && rating > 0
      },
    }),
    [createReview]
  )

  const handleRowClick = (row: Review) => {
    setActiveReview(row.id)
    openDrawer('reviews')
  }

  return (
    <>
      <DataTable<Review>
        label="Reviews"
        data={reviews}
        columns={columns}
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        searchable
        searchPlaceholder="Search by reviewer name..."
        actions={
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Create Review"
            title="Create Review"
          >
            <Plus size={20} />
          </Button>
        }
      />

      <AddNewDialog open={createOpen} onOpenChange={setCreateOpen} createConfig={createConfig} />

      {activeReview && <ReviewsDrawer review_id={activeReview} reviews={reviews} />}
    </>
  )
}
