import { Client } from 'minio'

import { requiredEnv } from '#shared/env/required.ts'

const endpoint = new URL(requiredEnv('S3_ENDPOINT'))

const minio = new Client({
  endPoint: endpoint.hostname,
  port: endpoint.port ? Number(endpoint.port) : undefined,
  useSSL: endpoint.protocol === 'https:',
  region: requiredEnv('S3_REGION'),
  accessKey: requiredEnv('S3_ACCESS_KEY_ID'),
  secretKey: requiredEnv('S3_SECRET_ACCESS_KEY'),
  pathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
})

export default minio
