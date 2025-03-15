'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Button
      variant="outline"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-1"
    >
      {theme === 'light' ? (
        <Moon size={20} strokeWidth={1}/>
      ) : (
        <Sun size={20} strokeWidth={1}/>
      )}
      <span className="text-sm font-light">{theme === 'light' ? 'Dark' : 'Light'}</span>
    </Button>
  )
}
