'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="w-16 h-16 flex flex-col items-center justify-center rounded-lg liquid-gold raised-off-page"
    >
      {theme === 'light' ? (
        <Moon size={20} className='text-white'/>
      ) : (
        <Sun size={20} className='text-white' />
      )}
      <span className="text-sm text-white">{theme === 'light' ? 'Dark' : 'Light'}</span>
    </Button>
  )
}
