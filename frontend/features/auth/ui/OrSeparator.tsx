import { Separator } from "@/shared/ui/base/separator";

export default function orSeparator() {
  return (
    <div className="flex w-full justify-center items-center mb-8">
      <div className="flex-grow">
        <Separator />
      </div>
      <small className="px-4">or</small>
      <div className="flex-grow">
        <Separator />
      </div>
    </div>
  )
}