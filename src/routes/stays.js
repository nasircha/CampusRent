const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Upload a JPEG, PNG, WebP, or GIF image.'), ok);
  }
});
const input = z.object({
  type: z.enum(['PG', 'HOSTEL', 'FLAT']),
  title: z.string().trim().min(3).max(80),
  address: z.string().trim().min(3).max(180),
  ownerName: z.string().trim().min(2).max(80),
  facilities: z.string().trim().max(600).optional().default(''),
  gateTiming: z.string().trim().max(80).optional().default('')
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const college = String(req.user.college || '').trim();
    if (!college) return res.json({ stays: [] });
    const stays = await prisma.accommodation.findMany({
      where: { college, status: 'available' },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ stays: stays.map(formatStay) });
  } catch (error) { next(error); }
});

router.post('/', requireAuth, upload.array('photos', 5), async (req, res, next) => {
  try {
    if (!String(req.user.college || '').trim()) return res.status(400).json({ error: 'Add your college to your account before listing a place.' });
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const photos = await Promise.all((req.files || []).map(uploadPhoto));
    const stay = await prisma.accommodation.create({
      data: { type: parsed.data.type, title: parsed.data.title, address: parsed.data.address, distanceKm: 0, price: 0, priceUnit: 'ROOM', totalRooms: 1, vacantRooms: 1, totalBeds: 0, vacantBeds: 0, contactPhone: '', description: JSON.stringify({ ownerName: parsed.data.ownerName, facilities: parsed.data.facilities, gateTiming: parsed.data.gateTiming }), photos: [], college: req.user.college, ownerId: req.user.id, status: 'pending' },
      include: { owner: { select: { id: true, name: true } } }
    });
    res.status(201).json({ stay: { ...formatStay(stay), ownerName: parsed.data.ownerName, facilities: parsed.data.facilities, gateTiming: parsed.data.gateTiming } });
  } catch (error) { next(error); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const stay = await prisma.accommodation.findUnique({ where: { id: req.params.id } });
    if (!stay || stay.ownerId !== req.user.id) return res.status(404).json({ error: 'Listing not found.' });
    await prisma.accommodation.delete({ where: { id: stay.id } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

async function uploadPhoto(file) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error = new Error('Photo storage is not configured. Please contact support.'); error.status = 503; throw error;
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'campusrent/stays';
  const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  form.append('api_key', CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: 'POST', body: form });
  const result = await response.json();
  if (!response.ok || !result.secure_url) { const error = new Error('Photo upload failed. Please try again.'); error.status = 502; throw error; }
  return result.secure_url;
}

function formatStay(s) {
  let extra = {};
  try { extra = s.description ? JSON.parse(s.description) : {}; } catch (_) {}
  return {
    id: s.id, type: s.type, title: s.title, address: s.address, distanceKm: s.distanceKm,
    price: s.price, priceUnit: s.priceUnit, totalRooms: s.totalRooms, vacantRooms: s.vacantRooms,
    totalBeds: s.totalBeds, vacantBeds: s.vacantBeds, description: s.description,
    contactPhone: s.contactPhone, photos: s.photos || [], college: s.college, status: s.status,
    facilities: extra.facilities || '', gateTiming: extra.gateTiming || '', ownerId: s.ownerId, ownerName: extra.ownerName || s.owner && s.owner.name || '', createdAt: s.createdAt
  };
}
module.exports = router;
