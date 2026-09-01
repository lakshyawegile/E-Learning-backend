const { S3Client } = require('@aws-sdk/client-s3');

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });
  return s3Client;
}

// Direct, permanent, publicly-readable URL for an object — used instead of
// proxying bytes through our own (currently http-only) backend, since that
// triggers mixed-content blocks on an https-served admin dashboard. Assumes
// path-style addressing (S3_FORCE_PATH_STYLE=true) to match this deployment's
// config; requires the bucket to actually grant public read on these keys.
function getPublicS3Url(key) {
  const endpoint = process.env.S3_ENDPOINT.replace(/\/+$/, '');
  return `${endpoint}/${process.env.S3_BUCKET}/${key}`;
}

module.exports = { getS3Client, getPublicS3Url };
