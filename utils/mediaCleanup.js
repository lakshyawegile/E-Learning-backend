const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getS3Client } = require('./s3Client');
const { FOLDER_RE, FILENAME_RE } = require('../controllers/mediaController');

// Matches only the /api/media/<folder>/<filename> path suffix (not the host,
// since PUBLIC_BASE_URL can differ per environment) to recognize a URL we
// generated ourselves via the upload endpoint, vs. an externally pasted one.
const MEDIA_PATH_RE = /\/api\/media\/([a-z0-9-]+)\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/i;

// Best-effort S3 cleanup for a single URL — never throws, never blocks the
// caller's response.
async function deleteMediaIfOwned(imageUrl) {
  if (!imageUrl) return;
  const match = MEDIA_PATH_RE.exec(imageUrl);
  if (!match) return;
  const [, folder, filename] = match;
  if (!FOLDER_RE.test(folder) || !FILENAME_RE.test(filename)) return;

  try {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `${folder}/${filename}`,
    }));
  } catch (err) {
    console.error('deleteMediaIfOwned error:', err);
  }
}

// For documents where uploaded images live inside arrays whose sub-document
// _ids get regenerated on every save (e.g. a whole-config get+upsert), URLs
// can't be matched by _id — instead, diff the full set of URLs present
// before vs. after the save and clean up whatever disappeared.
async function deleteOrphanedMedia(oldUrls, newUrls) {
  const newSet = new Set((newUrls || []).filter(Boolean));
  const removed = (oldUrls || []).filter((url) => url && !newSet.has(url));
  await Promise.all(removed.map((url) => deleteMediaIfOwned(url)));
}

module.exports = { deleteMediaIfOwned, deleteOrphanedMedia };
