const router = require('express').Router();
const jwt = require('jsonwebtoken');
const prisma = require('../db');
router.get('/', async (req, res, next) => {
  try {
    let user = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try { const p = jwt.verify(header.slice(7), process.env.JWT_SECRET); user = await prisma.user.findUnique({ where: { id: p.sub }, select: { id: true, name: true, college: true, email: true } }); } catch (_) { user = null; }
    }
    const items = await prisma.item.findMany({ where: user ? { OR: [{ status: { in: ['available','rented'] } }, { ownerId: user.id, status: 'paused' }] } : { status: { in: ['available','rented'] } }, include: { owner: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
    let rentals = [];
    if (user) {
      const rows = await prisma.rental.findMany({ where: { OR: [{ ownerId: user.id }, { renterId: user.id }] }, include: { owner: { select: { id: true, name: true, email: true } }, renter: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
      rentals = rows.map(r => ({ id: r.id, itemId: r.itemId, itemTitle: r.itemTitle, cat: r.cat, photo: r.photo, price: r.price, days: r.days, rent: r.rent, deposit: r.deposit, start: r.start.toISOString().slice(0,10), note: r.note, renterId: r.renterId, renterName: r.renter.name, renterEmail: ['accepted','returned'].includes(r.status) ? r.renter.email : '', ownerId: r.ownerId, ownerName: r.owner.name, ownerEmail: ['accepted','returned'].includes(r.status) ? r.owner.email : '', status: r.status, createdAt: r.createdAt }));
    }
    res.json({ user, items: items.map(i => ({ id: i.id, title: i.title, cat: i.cat, cond: i.cond, price: i.price, deposit: i.deposit, loc: i.loc, desc: i.desc, photo: i.photo, status: i.status, createdAt: i.createdAt, ownerId: i.ownerId, ownerName: i.owner.name })), rentals });
  } catch (e) { next(e); }
});
module.exports = router;
