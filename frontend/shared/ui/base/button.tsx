// The Button lives in @dorado/components now - built from the drawing at
// Themes and Components 25:510, audited 2026-08-30. This file is the doorway
// the 190-odd existing imports walk through; new code should import
// '@dorado/components' directly.
//
// TWO NAMES DIED WITH THE MOVE, and the compiler is the documentation:
//   variant="tertiary"    Link is a separate component ("a link navigates, a
//                     button acts") - import { Link } from '@dorado/components'
//   intent="brand"    the gold is retired, stated on the drawing itself
export {
  Button,
  buttonVariants,
  type ButtonProps,
  type ButtonIconProps,
  type ButtonEmphasis,
  type ButtonIntent,
} from '@dorado/components'
