'use client'

import { useLayoutEffect, useRef } from 'react'

export function useScrollLock(active: boolean) {
  const scrollYRef = useRef(0)
  const appliedRef = useRef(false)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const html = document.documentElement
    const body = document.body
    const target = body

    if (!target) return

    const freeze = () => {
      if (appliedRef.current) return
      appliedRef.current = true

      scrollYRef.current = window.pageYOffset || window.scrollY || 0

      const reserve = window.innerWidth - html.clientWidth
      if (reserve > 0) body.style.paddingRight = `${reserve}px`

      if (target === body) {
        html.style.overflow = 'hidden'
        html.style.overscrollBehavior = 'none'
        body.style.position = 'fixed'
        body.style.left = '0'
        body.style.right = '0'
        body.style.width = '100%'
        body.style.top = `-${scrollYRef.current}px`
      } else {
        const y = target.scrollTop
        target.dataset.__freezeY = String(y)
        target.style.overflow = 'hidden'
        target.style.position = 'relative'
        target.style.top = `-${y}px`
      }
    }

    const unfreeze = () => {
      if (!appliedRef.current) return
      appliedRef.current = false

      if (target === body) {
        const y = Math.abs(parseInt(body.style.top || '0', 10)) || scrollYRef.current

        html.style.overflow = ''
        html.style.overscrollBehavior = ''
        body.style.position = ''
        body.style.left = ''
        body.style.right = ''
        body.style.width = ''
        body.style.top = ''
        body.style.paddingRight = ''

        window.scrollTo(0, y)
      } else {
        const y = Number(target.dataset.__freezeY || '0')
        target.style.overflow = ''
        target.style.position = ''
        target.style.top = ''
        delete target.dataset.__freezeY
        target.scrollTop = y
      }
    }

    if (active) freeze()
    else unfreeze()

    return () => unfreeze()
  }, [active])
}
