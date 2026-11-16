const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf';
    cb(ok ? null : new Error('Upload a JPEG, PNG, WebP image, or PDF sample.'), ok);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const posts = await prisma.assignmentPost.findMany({
      where: { kind: 'offer' },
      include: { user: { select: { id: true, name: true, college: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ posts: posts.map(formatPost) });
  } catch (error) { next(error); }
});

router.post('/', requireAuth, upload.single('sample'), async (req, res, next) => {
  try {
    const parsed = z.object({
      format: z.enum(['handwritten', 'typed', 'both']),
      title: z.string().trim().min(4).max(90),
      subject: z.string().trim().min(2).max(60),
      description: z.string().trim().min(10).max(1200)
    }).safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!req.file) {
      return res.status(400).json({ error: 'Writers offering help must upload a sample photo or PDF.' });
    }
    let sampleUrl = '', sampleName = '';
    if (req.file) {
      sampleUrl = await uploadSample(req.file);
      sampleName = req.file.originalname.slice(0, 120);
    }
    const post = await prisma.assignmentPost.create({
      data: { ...parsed.data, kind: 'offer', sampleUrl, sampleName, userId: req.user.id },
      include: { user: { select: { id: true, name: true, college: true } } }
    });
    res.status(201).json({ post: formatPost(post) });
  } catch (error) { next(error); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await prisma.assignmentPost.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } });
    if (!post || post.userId !== req.user.id) return res.status(404).json({ error: 'Assignment post not found.' });
    await prisma.assignmentPost.delete({ where: { id: post.id } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

async function uploadSample(file) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error = new Error('Sample storage is not configured. Please contact support.'); error.status = 503; throw error;
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'campusrent/assignment-samples';
  const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  form.append('api_key', CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/auto/upload`, { method: 'POST', body: form });
  const result = await response.json();
  if (!response.ok || !result.secure_url) { const error = new Error('Sample upload failed. Please try again.'); error.status = 502; throw error; }
  return result.secure_url;
}

function formatPost(post) {
  return {
    id: post.id, kind: post.kind, format: post.format, title: post.title,
    subject: post.subject, description: post.description, sampleUrl: post.sampleUrl,
    sampleName: post.sampleName, createdAt: post.createdAt,
    userId: post.userId, userName: post.user.name, college: post.user.college || ''
  };
}
module.exports = router;
