'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { useGetSession } from '@/features/auth/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'

import type { Review } from '@/features/reviews/types'

import { DataTable } from '@/shared/ui/table/Table'
import {
  TextColumn,
  DateColumn,
  IconColumn,
  RatingColumn,
} from '@/shared/ui/table/Columns'
import { EyeSlashIcon, EyeIcon, PlusIcon, StarIcon } from '@phosphor-icons/react'
import { CreateConfig } from '@/shared/ui/table/AddNew'
import { useCreateReview, useReviews } from '@/features/reviews/queries'
import ReviewsDrawer from '@/features/reviews/ui/ReviewsDrawer'

export default function ReviewsPage() {
  const { data: reviews = [] } = useReviews()
  const { user } = useGetSession()
  const createReview = useCreateReview()
  const { openDrawer } = useDrawerStore()

  const [activeReview, setActiveReview] = React.useState<string | null>(null)

  // ----- star counts for filter cards -----
  const starCounts = React.useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const r of reviews) {
      const rt = Math.round(Number(r.rating) || 0)
      if (rt >= 1 && rt <= 5) counts[rt]++
    }
    return counts
  }, [reviews])

  const filterCards = React.useMemo(
    () =>
      [5, 4, 3, 2, 1].map((star) => ({
        key: star,
        Icon: StarIcon,
        filter: `${star}`,
        header: `${starCounts[star] ?? 0}`,
        label: `${star} Star${star === 1 ? '' : 's'}`,
        predicate: (row: Review) =>
          Math.round(Number(row.rating) || 0) === star,
      })),
    [starCounts]
  )

  const columns: ColumnDef<Review>[] = React.useMemo(
    () => [
      TextColumn<Review>({
        id: 'name',
        header: 'Name',
        accessorKey: 'name',
        align: 'left',
        enableHiding: false,
        enableColumnFilter: true,
      }),

      RatingColumn<Review>({
        id: 'rating',
        accessorKey: 'rating',
        header: 'Rating',
        align: 'center',
        size: 140,
      }),

      TextColumn<Review>({
        id: 'review_text',
        header: 'Review',
        accessorKey: 'review_text',
        align: 'left',
        enableColumnFilter: true,
        textClassName:
          'text-xs sm:text-sm text-neutral-900 line-clamp-2 max-w-[38ch]',
        size: 320,
      }),

      IconColumn<Review>({
        id: 'hidden',
        header: 'Visibility',
        accessorKey: 'hidden',
        align: 'center',
        renderIcon: ({ value }) =>
          value ? (
            <EyeSlashIcon size={24} className="text-destructive" />
          ) : (
            <EyeIcon size={24} className="text-success" />
          ),
        size: 120,
      }),

      DateColumn<Review>({
        id: 'created_at',
        header: 'Created',
        accessorKey: 'created_at',
        align: 'center',
        hideOnSmall: true,
        size: 160,
      }),
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
          created_by: user?.name ?? '',
          updated_by: user?.name ?? '',
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
    [createReview, user]
  )

  const handleRowClick = (row: Row<Review>) => {
    setActiveReview(row.original.id)
    openDrawer('reviews')
  }

  return (
    <>
      <DataTable<Review>
        data={reviews}
        columns={columns}
        initialPageSize={12}
        searchColumnId="name"
        searchPlaceholder="Search by reviewer name..."
        enableColumnVisibility
        onRowClick={handleRowClick}
        getRowClassName={() =>
          'hover:bg-background hover:cursor-pointer'
        }
        createIcon={PlusIcon}
        createConfig={createConfig}
        filterCards={filterCards}
      />

      {activeReview && <ReviewsDrawer review_id={activeReview} reviews={reviews} />}
    </>
  )
}
