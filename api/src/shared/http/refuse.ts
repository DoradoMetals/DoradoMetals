export interface HttpError extends Error {
  statusCode?: number
}

export function refuse(status: number, message: string): HttpError {
  const err: HttpError = new Error(message)
  err.statusCode = status
  return err
}

export function refuseWith(status: number, message: string): never {
  throw refuse(status, message)
}
