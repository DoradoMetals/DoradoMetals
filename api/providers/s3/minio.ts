// The object store. An adapter to something outside the domain, which is why
// it lives here rather than in features/media: media decides which images a
// user may see, this decides how bytes reach S3-compatible storage. Swapping
// the store should not touch a feature.
import { Client } from 'minio';

import { requiredEnv } from '#shared/env/required.ts';

const minio = new Client({
  // requiredEnv here changes NO behavior — minio already throws on a missing endpoint at construction; this only names the variable.
  // accessKey/secretKey are deliberately left optional even though missing ones are dangerous — `new Client({accessKey: undefined, ...})` constructs fine and fails later with an unhelpful S3 error; making them required is the boot-time env-validation decision in FOLLOWUPS.md, not this file's to take.
  endPoint: requiredEnv('MINIO_ENDPOINT'),
  port: Number(process.env.MINIO_PORT || 443),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

export default minio;