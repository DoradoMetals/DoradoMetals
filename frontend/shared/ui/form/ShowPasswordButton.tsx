import { Button, Eye, EyeOff } from '@dorado/components'

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
        <EyeOff className="text-muted-foreground" size={18} />
      ) : (
        <Eye className="text-muted-foreground" size={18} />
      )}
    </Button>
  )
}
