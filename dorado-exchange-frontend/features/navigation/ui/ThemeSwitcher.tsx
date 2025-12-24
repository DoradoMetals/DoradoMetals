'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/shared/ui/base/button'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="w-20 h-18 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
    >
      {theme === 'light' ? (
        <MoonIcon size={24} className='text-primary'/>
      ) : (
        <SunIcon size={24} className='text-primary'/>
      )}
      <span className="text-sm text-primary">{theme === 'light' ? 'Dark' : 'Light'}</span>
    </Button>
  )
}
