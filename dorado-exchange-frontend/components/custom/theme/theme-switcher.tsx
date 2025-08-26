'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="w-18 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
    >
      {theme === 'light' ? (
        <MoonIcon size={24} color={getPrimaryIconStroke()}/>
      ) : (
        <SunIcon size={24} color={getPrimaryIconStroke()} />
      )}
      <span className="text-sm text-primary-gradient">{theme === 'light' ? 'Dark' : 'Light'}</span>
    </Button>
  )
}
