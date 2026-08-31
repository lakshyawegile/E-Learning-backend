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

module.exports = { getS3Client };
