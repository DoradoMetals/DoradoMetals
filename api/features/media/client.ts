import { Client } from 'minio';

import { requiredEnv } from '#shared/env/required.ts';

const minio = new Client({
  // requiredEnv rather than the bare read, and it changes NO behaviour: minio
  // already throws "Invalid endPoint : undefined" from this constructor at
  // import time, so an unset endpoint has always stopped the process here. This
  // only names the variable that is missing.
  //
  // The keys are left as they are on purpose, and they are the dangerous ones:
  // `new Client({ accessKey: undefined, secretKey: undefined })` CONSTRUCTS
  // FINE - checked - and fails later against the bucket with an S3 error that
  // names nothing. Making them required here would refuse to boot, and whether
  // the process should die for an unset variable is the env-validation decision
  // in FOLLOWUPS.md, which is not mine to take.
  endPoint: requiredEnv('MINIO_ENDPOINT'),
  port: Number(process.env.MINIO_PORT || 443),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

export default minio;