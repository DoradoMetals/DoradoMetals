import { CheckSquare } from 'lucide-react'

interface ValidCheckIconProps {
  isValid: boolean
  size?: number
  className?: string
}

export function ValidCheckIcon({ isValid, size = 16, className = '' }: ValidCheckIconProps) {
  if (!isValid) return null

  return (
    <div
      className={`absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none ${className}`}
    >
      <CheckSquare size={size} />
    </div>
  )
}
