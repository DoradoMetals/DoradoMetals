'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'

export function ThemeSwitcherDesktop() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      effect="expandIcon"
      iconPlacement="right"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      icon={theme === 'light' ? Moon : Sun}
      iconSize={20}
      className="px-3 h-8 py-1 text-md font-light bg-card hover:bg-card hover:text-primary"
    >
      {theme === 'light' ? <div>Dark Theme</div> : <div>Light Theme</div>}
    </Button>
  )
}
