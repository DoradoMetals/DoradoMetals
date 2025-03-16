'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'

export function ThemeSwitcherDesktop() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Button
      variant="ghost"
      effect="expandIcon"
      iconPlacement="right"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      icon={theme === 'light' ? Moon : Sun}
      iconSize={20}
      className="px-3 h-8 py-1 text-md font-light bg-background hover:bg-background hover:text-primary"
    >
      {theme === 'light' ? <div>Dark Theme</div> : <div>Light Theme</div>}
    </Button>
  )
}
