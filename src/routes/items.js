const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, isAdminEmail } = require('../middleware/auth');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ? null : new Error('Upload a JPEG, PNG, WebP, or GIF image.'), /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) });
const itemInput = z.object({ title: z.string().trim().min(3).max(70), cat: z.enum(['calc','pens','lab','books','tech','other']), cond: z.enum(['New','Like new','Good','Worn but works']), price: z.coerce.number().int().min(1).max(5000), deposit: z.coerce.number().int().min(0).max(20000), loc: z.string().trim().min(2).max(60), desc: z.string().trim().max(400).optional().default('') });
const publicItem = { owner: { select: { id: true, name: true } } };
router.get('/', async (req, res, next) => { try { const items = await prisma.item.findMany({ where: { status: { in: ['available','rented'] } }, include: publicItem, orderBy: { createdAt: 'desc' } }); res.json({ items: items.map(formatItem) }); } catch (e) { next(e); } });
router.get('/:id', async (req, res, next) => { try { const item = await prisma.item.findUnique({ where: { id: req.params.id }, include: publicItem }); if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Listing not found.' }); res.json({ item: formatItem(item) }); } catch (e) { next(e); } });
router.post('/', requireAuth, upload.single('photo'), async (req, res, next) => { try { const parsed = itemInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message }); const photo = req.file ? await uploadPhoto(req.file) : ''; const item = await prisma.item.create({ data: { ...parsed.data, ownerId: req.user.id, photo }, include: publicItem }); res.status(201).json({ item: formatItem(item) }); } catch (e) { next(e); } });
async function uploadPhoto(file) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error = new Error('Photo storage is not configured. Please contact support.'); error.status = 503; throw error;
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'campusrent/items';
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
router.patch('/:id/status', requireAuth, async (req, res, next) => { try { const item = await prisma.item.findUnique({ where: { id: req.params.id } }); if (!item || item.ownerId !== req.user.id) return res.status(404).json({ error: 'Listing not found.' }); if (item.status === 'rented') return res.status(409).json({ error: 'A rented item cannot be paused.' }); const status = item.status === 'paused' ? 'available' : 'paused'; await prisma.item.update({ where: { id: item.id }, data: { status } }); res.json({ ok: true, status }); } catch (e) { next(e); } });
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: { rentals: { select: { id: true, status: true } } }
    });
    if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Listing not found.' });
    const isAdmin = isAdminEmail(req.user.email);
    if (!isAdmin && item.ownerId !== req.user.id) return res.status(404).json({ error: 'Listing not found.' });
    if (!isAdmin && item.status === 'rented') return res.status(409).json({ error: 'You cannot delete an item while it is rented.' });
    await prisma.$transaction(async tx => {
      await tx.rental.updateMany({ where: { itemId: item.id, status: 'pending' }, data: { status: 'declined' } });
      if (isAdmin || item.rentals.length) {
        await tx.item.update({ where: { id: item.id }, data: { status: 'deleted' } });
      } else {
        await tx.item.delete({ where: { id: item.id } });
      }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
function formatItem(i) { return { id: i.id, title: i.title, cat: i.cat, cond: i.cond, price: i.price, deposit: i.deposit, loc: i.loc, desc: i.desc, photo: i.photo, status: i.status, createdAt: i.createdAt, ownerId: i.ownerId, ownerName: i.owner?.name || '' }; }
module.exports = router;
