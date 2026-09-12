import { color } from '@dorado/theme/tokens'

export type Palette = {
  background: string
  card: string
  border: string
  foreground: string
  muted: string
  primary: string
  onPrimary: string
}

/** A mailer's ground: the app's own dark surface. */
export const screen: Palette = {
  background: color('background'),
  card: color('card'),
  border: color('border'),
  foreground: color('foreground'),
  muted: color('muted-foreground'),
  primary: color('primary'),
  onPrimary: color('primary-foreground'),
}

/** The same roles on paper, and the pair the Documents page binds to. */
export const paper: Palette = {
  background: color('primary'),
  card: color('primary'),
  border: color('subtle'),
  foreground: color('primary-foreground'),
  muted: color('placeholder'),
  primary: color('primary-foreground'),
  onPrimary: color('primary'),
}
