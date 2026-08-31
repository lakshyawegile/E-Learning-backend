const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getS3Client } = require('../utils/s3Client');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FOLDER_RE = /^[a-z0-9-]+$/;
const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported file type. Allowed: jpeg, png, webp.'));
    }
    cb(null, true);
  },
});

// Wraps multer so its errors come back as JSON ({ message }), matching the
// rest of the API — there's no global error handler in app.js today, so an
// uncaught MulterError would otherwise fall through to Express's default
// HTML/plain-text error response.
const uploadSingleImage = (req, res, next) => {
  multerUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    next();
  });
};

async function compressToBuffer(buffer, mimetype) {
  // .rotate() with no args auto-orients from the photo's EXIF tag before
  // resizing — without it, phone photos shot in portrait come out sideways.
  const pipeline = sharp(buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true });

  switch (mimetype) {
    case 'image/jpeg':
      return pipeline.jpeg({ quality: 80 }).toBuffer();
    case 'image/png':
      return pipeline.png({ compressionLevel: 8 }).toBuffer();
    case 'image/webp':
      return pipeline.webp({ quality: 80 }).toBuffer();
    default:
      throw new Error('Unsupported mimetype');
  }
}

// POST /api/media/upload
const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'image file is required' });

    const folder = String(req.body.folder || '').trim();
    if (!FOLDER_RE.test(folder)) {
      return res.status(400).json({ message: 'folder must match [a-z0-9-]+' });
    }

    const ext = EXT_BY_MIME[req.file.mimetype];
    const key = `${folder}/${crypto.randomUUID()}.${ext}`;
    const outBuffer = await compressToBuffer(req.file.buffer, req.file.mimetype);

    await getS3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: outBuffer,
      ContentType: req.file.mimetype,
    }));

    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({ url: `${base}/api/media/${key}` });
  } catch (err) {
    console.error('uploadImage error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/media/:folder/:filename
const serveMediaImage = async (req, res) => {
  const { folder, filename } = req.params;
  if (!FOLDER_RE.test(folder) || !FILENAME_RE.test(filename)) {
    return res.status(404).json({ message: 'Not found' });
  }

  const key = `${folder}/${filename}`;
  let body;

  try {
    const result = await getS3Client().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
    );
    body = result.Body;

    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
    if (result.ContentLength != null) res.setHeader('Content-Length', result.ContentLength);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } catch (err) {
    if (err.name === 'NoSuchKey') return res.status(404).json({ message: 'Not found' });
    console.error('serveMediaImage S3 error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }

  // Headers are already flushed once piping starts — if the stream errors
  // mid-flight we can no longer send a JSON error, just abort the connection.
  body.on('error', (err) => {
    console.error('serveMediaImage stream error:', err);
    res.destroy(err);
  });

  // If the client disconnects early, destroy the S3 body so the SDK's
  // underlying connection isn't held open until the object finishes streaming.
  res.on('close', () => {
    if (!res.writableEnded) body.destroy();
  });

  body.pipe(res);
};

module.exports = { uploadSingleImage, uploadImage, serveMediaImage, FOLDER_RE, FILENAME_RE };
