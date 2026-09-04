// The "Updated by <name> on <date>" line under every admin drawer header.
// `date` arrives already formatted (callers keep their formatFullDate call);
// omitting `name` entirely renders the nameless "Updated on <date>" form -
// passing a null/empty name keeps the "by" form with an empty span, exactly
// as the inlined originals did.
type UpdatedBylineProps = {
  name?: React.ReactNode
  date: string
}

export default function UpdatedByline({ name, date }: UpdatedBylineProps) {
  return (
    <small className="flex w-full justify-start gap-1">
      {name !== undefined ? (
        <>
          <span>Updated by</span>
          <span data-emphasis="default">{name}</span>
          <span>on</span>
        </>
      ) : (
        <>
          <span>Updated</span>
          <span>on</span>
        </>
      )}
      <span data-emphasis="default">{date}</span>
    </small>
  )
}
