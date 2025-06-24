import { CheckIcon, CheckSquareIcon, XIcon, XSquareIcon } from '@phosphor-icons/react'

interface IconProps {
  size?: number
  className?: string
}

export function ValidCheckIcon({  size = 16, className = '' }: IconProps) {

  return (
    <div
      className={`absolute right-3 top-1/2 -translate-y-1/2 text-success pointer-events-none ${className}`}
    >
      <CheckIcon size={size} />
    </div>
  )
}

export function InvalidXIcon({ size = 16, className = '' }: IconProps) {

  return (
    <div
      className={`absolute right-3 top-1/2 -translate-y-1/2 text-destructive pointer-events-none ${className}`}
    >
      <XIcon size={size} />
    </div>
  )
}
