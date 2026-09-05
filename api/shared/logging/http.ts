import { pinoHttp } from 'pino-http'
import { logger } from '#shared/logging/logger.ts'

let nextRequestId = 0

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? String(++nextRequestId),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ status: res.statusCode }),
  },
  customErrorMessage: (_req, res) => `request errored ${res.statusCode}`,
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
})
