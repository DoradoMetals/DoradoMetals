import { Separator } from "@/components/ui/separator";

export default function orSeparator() {
  return (
    <div className="flex w-full justify-center items-center mb-8 text-sm text-neutral-500 ">
      <div className="flex-grow">
        <Separator />
      </div>
      <span className="px-4">or</span>
      <div className="flex-grow">
        <Separator />
      </div>
    </div>
  )
}