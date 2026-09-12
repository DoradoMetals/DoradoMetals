import { Client } from 'minio'

import { requiredEnv } from '#shared/env/required.ts'

const minio = new Client({
  endPoint: requiredEnv('MINIO_ENDPOINT'),
  port: Number(process.env.MINIO_PORT || 443),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
})

export default minio
