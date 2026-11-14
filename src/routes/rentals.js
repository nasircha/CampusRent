const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);

// Lightweight count for the navigation badge; avoids loading every rental.
router.get('/notifications', async (req, res, next) => {
  try {
    const pendingCount = await prisma.rental.count({
      where: { ownerId: req.user.id, status: 'pending' }
    });
    res.json({ pendingCount });
  } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
  try {
    const parsed = z.object({ itemId: z.string().min(1), days: z.number().int().min(1).max(30), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(120).optional().default('') }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { itemId, days, start, note } = parsed.data;
    const date = new Date(`${start}T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== start) return res.status(400).json({ error: 'Choose a valid pickup date.' });
    const today = new Date(); today.setUTCHours(0,0,0,0); if (date < today) return res.status(400).json({ error: 'Pickup date cannot be in the past.' });
    const rental = await prisma.$transaction(async tx => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'available') throw Object.assign(new Error('This item is no longer available.'), { status: 409 });
      if (item.ownerId === req.user.id) throw Object.assign(new Error('You cannot request your own listing.'), { status: 400 });
      return tx.rental.create({ data: { itemId, renterId: req.user.id, ownerId: item.ownerId, itemTitle: item.title, cat: item.cat, photo: item.photo, price: item.price, days, rent: days * item.price, deposit: item.deposit, start: date, note }, include: { renter: { select: { name: true, email: true } }, owner: { select: { name: true, email: true } } } });
    }, { isolationLevel: 'Serializable' });
    res.status(201).json({ rental: formatRental(rental) });
  } catch (e) { if (e.code === 'P2034') return res.status(409).json({ error: 'The item availability changed. Refresh and try again.' }); next(e); }
});
router.patch('/:id/:action', async (req, res, next) => {
  try {
    const { id, action } = req.params;
    const result = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findUnique({ where: { id }, include: { item: true } });
      if (!rental) throw Object.assign(new Error('Rental request not found.'), { status: 404 });
      let update;
      if (action === 'accept') {
        if (rental.ownerId !== req.user.id) throw Object.assign(new Error('Only the listing owner can accept this request.'), { status: 403 });
        if (rental.status !== 'pending') throw Object.assign(new Error('This request is no longer pending.'), { status: 409 });
        const item = await tx.item.findUnique({ where: { id: rental.itemId } });
        if (!item || item.status !== 'available') throw Object.assign(new Error('This item is no longer available.'), { status: 409 });
        await tx.item.update({ where: { id: item.id }, data: { status: 'rented' } });
        await tx.rental.updateMany({ where: { itemId: item.id, id: { not: id }, status: 'pending' }, data: { status: 'declined' } });
        update = { status: 'accepted' };
      } else if (action === 'decline') {
        if (rental.ownerId !== req.user.id) throw Object.assign(new Error('Only the listing owner can decline this request.'), { status: 403 });
        if (rental.status !== 'pending') throw Object.assign(new Error('This request is no longer pending.'), { status: 409 }); update = { status: 'declined' };
      } else if (action === 'cancel') {
        if (rental.renterId !== req.user.id) throw Object.assign(new Error('Only the renter can cancel this request.'), { status: 403 });
        if (rental.status !== 'pending') throw Object.assign(new Error('Only pending requests can be cancelled.'), { status: 409 }); update = { status: 'cancelled' };
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
  } catch (e) { if (e.code === 'P2034') return res.status(409).json({ error: 'The item state changed. Refresh and try again.' }); next(e); }
});
function formatRental(r) { const reveal = ['accepted','returned'].includes(r.status); return { id: r.id, itemId: r.itemId, itemTitle: r.itemTitle, cat: r.cat, photo: r.photo, price: r.price, days: r.days, rent: r.rent, deposit: r.deposit, start: r.start.toISOString().slice(0,10), note: r.note, renterId: r.renterId, renterName: r.renter.name, renterEmail: reveal ? r.renter.email : '', ownerId: r.ownerId, ownerName: r.owner.name, ownerEmail: reveal ? r.owner.email : '', status: r.status, createdAt: r.createdAt }; }
module.exports = router;
