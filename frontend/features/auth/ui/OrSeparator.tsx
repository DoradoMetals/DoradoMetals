import { Divider } from "@dorado/components";

export default function orSeparator() {
  return (
    <div className="flex w-full justify-center items-center mb-8">
      <div className="flex-grow">
        <Divider />
      </div>
      <small className="px-4">or</small>
      <div className="flex-grow">
        <Divider />
      </div>
    </div>
  )
}