import { EventEmitter } from 'node:events'
import type { SpotBoard } from '@dorado/contracts'

const boards = new EventEmitter()
boards.setMaxListeners(0)
let last = ''

export function publish(board: SpotBoard): void {
  const text = JSON.stringify(board)
  if (text === last) return
  last = text
  boards.emit('board', text)
}

export function subscribe(listener: (board: string) => void): () => void {
  boards.on('board', listener)
  return () => {
    boards.off('board', listener)
  }
}
