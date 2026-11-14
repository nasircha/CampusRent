const router = require('express').Router();
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptCollegeId, decryptCollegeId } = require('../services/college-id');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => cb(/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? null : new Error('Upload a JPEG, PNG, WebP, or GIF image.'), /^image\/(jpeg|png|webp)$/.test(file.mimetype)) });
router.use(requireAuth);

// Lightweight count for the navigation badge; avoids loading every rental.
router.get('/notifications', async (req, res, next) => {
  try {
    const pendingCount = await prisma.rental.count({ where: { ownerId: req.user.id, status: 'pending' } });
    res.json({ pendingCount });
  } catch (error) { next(error); }
});

// The saved ID is private to its student; only metadata is returned here.
router.get('/college-id/me', async (req, res, next) => {
  try {
    const saved = await prisma.collegeId.findUnique({ where: { userId: req.user.id }, select: { updatedAt: true } });
    res.json({ exists: !!saved, updatedAt: saved?.updatedAt || null });
  } catch (error) { next(error); }
});

router.post('/college-id/me', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a clear College ID photo.' });
    const encrypted = encryptCollegeId(req.file.buffer);
    const saved = await prisma.collegeId.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...encrypted, mimeType: req.file.mimetype },
      update: { ...encrypted, mimeType: req.file.mimetype }
    });
    res.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (error) { next(error); }
});

router.post('/', upload.single('collegeIdFile'), async (req, res, next) => {
  try {
    const parsed = z.object({
      itemId: z.string().min(1),
      days: z.coerce.number().int().min(1).max(30),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      note: z.string().max(120).optional().default(''),
      collegeIdMode: z.enum(['saved', 'new'])
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { itemId, days, start, note, collegeIdMode } = parsed.data;
    const date = new Date(`${start}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== start) return res.status(400).json({ error: 'Choose a valid pickup date.' });
    const today = new Date(); today.setUTCHours(0,0,0,0);
    if (date < today) return res.status(400).json({ error: 'Pickup date cannot be in the past.' });

    let idPayload;
    if (collegeIdMode === 'new') {
      if (!req.file) return res.status(400).json({ error: 'Upload your College ID photo to continue.' });
      idPayload = { ...encryptCollegeId(req.file.buffer), mimeType: req.file.mimetype };
    } else {
      const saved = await prisma.collegeId.findUnique({ where: { userId: req.user.id } });
      if (!saved) return res.status(400).json({ error: 'No saved College ID found. Upload it first.' });
      idPayload = { encryptedData: saved.encryptedData, iv: saved.iv, authTag: saved.authTag, mimeType: saved.mimeType };
    }

    const rental = await prisma.$transaction(async tx => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'available') throw Object.assign(new Error('This item is no longer available.'), { status: 409 });
      if (item.ownerId === req.user.id) throw Object.assign(new Error('You cannot request your own listing.'), { status: 400 });
      if (collegeIdMode === 'new') {
        await tx.collegeId.upsert({
          where: { userId: req.user.id },
          create: { userId: req.user.id, ...idPayload },
          update: idPayload
        });
      }
      const created = await tx.rental.create({
        data: {
          itemId, renterId: req.user.id, ownerId: item.ownerId, itemTitle: item.title,
          cat: item.cat, photo: item.photo, price: item.price, days, rent: days * item.price,
          deposit: item.deposit, start: date, note,
          collegeId: { create: idPayload }
        },
        include: { collegeId: true, renter: { select: { name: true, email: true } }, owner: { select: { name: true, email: true } } }
      });
      return created;
    }, { isolationLevel: 'Serializable' });
    res.status(201).json({ rental: formatRental(rental) });
  } catch (error) {
    if (error.code === 'P2034') return res.status(409).json({ error: 'The item availability changed. Refresh and try again.' });
    next(error);
  }
});

router.get('/:id/college-id', async (req, res, next) => {
  try {
    const rental = await prisma.rental.findUnique({ where: { id: req.params.id }, include: { collegeId: true } });
    if (!rental) return res.status(404).json({ error: 'Rental request not found.' });
    if (rental.ownerId !== req.user.id) return res.status(403).json({ error: 'Only this product owner can view the College ID.' });
    if (!rental.collegeId) return res.status(404).json({ error: 'College ID not found for this request.' });
    const image = decryptCollegeId(rental.collegeId);
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    res.type(rental.collegeId.mimeType).send(image);
  } catch (error) { next(error); }
});

router.patch('/:id/college-id', async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(['verified', 'rejected']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose verify or reject.' });
    const rental = await prisma.rental.findUnique({ where: { id: req.params.id }, include: { collegeId: true } });
    if (!rental) return res.status(404).json({ error: 'Rental request not found.' });
    if (rental.ownerId !== req.user.id) return res.status(403).json({ error: 'Only this product owner can verify the College ID.' });
    if (rental.status !== 'pending') return res.status(409).json({ error: 'This rental request is no longer pending.' });
    if (!rental.collegeId) return res.status(404).json({ error: 'College ID not found for this request.' });
    const result = await prisma.rentalCollegeId.update({
      where: { rentalId: rental.id },
      data: { status: parsed.data.decision, reviewedAt: new Date() },
      select: { status: true, reviewedAt: true }
    });
    res.json({ collegeId: result });
  } catch (error) { next(error); }
});

router.patch('/:id/:action', async (req, res, next) => {
  try {
    const { id, action } = req.params;
    const result = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findUnique({ where: { id }, include: { item: true, collegeId: true } });
      if (!rental) throw Object.assign(new Error('Rental request not found.'), { status: 404 });
      let update;
      if (action === 'accept') {
        if (rental.ownerId !== req.user.id) throw Object.assign(new Error('Only the listing owner can accept this request.'), { status: 403 });
        if (rental.status !== 'pending') throw Object.assign(new Error('This request is no longer pending.'), { status: 409 });
        if (!rental.collegeId || rental.collegeId.status !== 'verified') throw Object.assign(new Error('Verify the student College ID before accepting this request.'), { status: 409 });
        const item = await tx.item.findUnique({ where: { id: rental.itemId } });
        if (!item || item.status !== 'available') throw Object.assign(new Error('This item is no longer available.'), { status: 409 });
        await tx.item.update({ where: { id: item.id }, data: { status: 'rented' } });
        await tx.rental.updateMany({ where: { itemId: item.id, id: { not: id }, status: 'pending' }, data: { status: 'declined' } });
        update = { status: 'accepted' };
      } else if (action === 'decline') {
        if (rental.ownerId !== req.user.id) throw Object.assign(new Error('Only the listing owner can decline this request.'), { status: 403 });
        if (rental.status !== 'pending') throw Object.assign(new Error('This request is no longer pending.'), { status: 409 });
        update = { status: 'declined' };
      } else if (action === 'cancel') {
        if (rental.renterId !== req.user.id) throw Object.assign(new Error('Only the renter can cancel this request.'), { status: 403 });
        if (rental.status !== 'pending') throw Object.assign(new Error('Only pending requests can be cancelled.'), { status: 409 });
        update = { status: 'cancelled' };
      } else if (action === 'return') {
        if (rental.ownerId !== req.user.id) throw Object.assign(new Error('Only the listing owner can mark an item returned.'), { status: 403 });
        if (rental.status !== 'accepted') throw Object.assign(new Error('Only accepted rentals can be marked returned.'), { status: 409 });
        await tx.item.update({ where: { id: rental.itemId }, data: { status: 'available' } });
        await tx.conversation.updateMany({ where: { itemId: rental.itemId, renterId: rental.renterId, archivedAt: null }, data: { archivedAt: new Date() } });
        update = { status: 'returned', returnedAt: new Date() };
      } else throw Object.assign(new Error('Unknown rental action.'), { status: 404 });
      return tx.rental.update({ where: { id }, data: update });
    }, { isolationLevel: 'Serializable' });
    res.json({ rental: result });
  } catch (error) {
    if (error.code === 'P2034') return res.status(409).json({ error: 'The item state changed. Refresh and try again.' });
    next(error);
  }
});

function formatRental(r) {
  const reveal = ['accepted', 'returned'].includes(r.status);
  return {
    id: r.id, itemId: r.itemId, itemTitle: r.itemTitle, cat: r.cat, photo: r.photo,
    price: r.price, days: r.days, rent: r.rent, deposit: r.deposit,
    start: r.start.toISOString().slice(0,10), note: r.note, renterId: r.renterId,
    renterName: r.renter.name, renterEmail: reveal ? r.renter.email : '',
    ownerId: r.ownerId, ownerName: r.owner.name, ownerEmail: reveal ? r.owner.email : '',
    status: r.status, collegeIdStatus: r.collegeId?.status || 'missing', createdAt: r.createdAt
  };
}
module.exports = router;
