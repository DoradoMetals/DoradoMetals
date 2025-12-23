import { useRef } from "react"

export function useRenderCount(label: string) {
  const n = useRef(0)
  n.current += 1
  console.log(`[render] ${label} #${n.current}`)
  return n.current
}