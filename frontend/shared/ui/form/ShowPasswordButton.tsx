import { Button } from '@dorado/components'
import { Eye, EyeOff } from 'lucide-react'

export default function ShowPasswordButton({
  showPassword,
  setShowPassword,
}: {
  showPassword: boolean
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>> 
}) {
  return (
    <Button
      type="button"
      variant="tertiary"
      size="icon"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-transparent"
      tabIndex={-1}
    >
      {showPassword ? (
        <EyeOff className="text-neutral-600" size={18} />
      ) : (
        <Eye className="text-neutral-600" size={18} />
      )}
    </Button>
  )
}
