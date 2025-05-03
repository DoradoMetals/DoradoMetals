'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-1 border-primary bg-card raised-off-page"
    >
      {theme === 'light' ? (
        <Moon size={20} className='text-primary'/>
      ) : (
        <Sun size={20} className='text-primary'/>
      )}
      <span className="text-sm text-primary-gradient">{theme === 'light' ? 'Dark' : 'Light'}</span>
    </Button>
  )
}
