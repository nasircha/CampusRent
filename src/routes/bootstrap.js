const router = require('express').Router();
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { Prisma } = require('@prisma/client');
const { isAdminEmail } = require('../middleware/auth');
router.get('/', async (req, res, next) => {
  try {
    let user = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try { const p = jwt.verify(header.slice(7), process.env.JWT_SECRET); user = await prisma.user.findUnique({ where: { id: p.sub }, select: { id: true, name: true, college: true, email: true } }); if (user) user = { ...user, isAdmin: isAdminEmail(user.email) }; } catch (_) { user = null; }
    }
    const itemWhere = user && user.isAdmin ? { status: { not: 'deleted' } } : user ? { OR: [{ status: { in: ['available','rented'] } }, { ownerId: user.id, status: 'paused' }] } : { status: { in: ['available','rented'] } };
    const items = await prisma.item.findMany({ where: itemWhere, include: { owner: { select: { id: true, name: true, college: true } } }, orderBy: { createdAt: 'desc' } });
    const itemIds = items.map(i => i.id);
    const ratingGroups = itemIds.length ? await prisma.itemRating.groupBy({ by: ['itemId'], where: { itemId: { in: itemIds } }, _avg: { stars: true }, _count: { _all: true } }) : [];
    const ratingMap = Object.fromEntries(ratingGroups.map(r => [r.itemId, { ratingAverage: Number(r._avg.stars.toFixed(1)), ratingCount: r._count._all }]));
    const usageGroups = itemIds.length ? await prisma.$queryRaw`SELECT "itemId", COUNT(DISTINCT "renterId")::int AS "usersUsedCount" FROM "Rental" WHERE "itemId" IN (${Prisma.join(itemIds)}) AND "status" IN ('accepted','returned') GROUP BY "itemId"` : [];
    let rentals = [];
    if (user) {
      const rows = await prisma.rental.findMany({ where: { OR: [{ ownerId: user.id }, { renterId: user.id }] }, include: { owner: { select: { id: true, name: true, email: true } }, renter: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
      rentals = rows.map(r => ({ id: r.id, itemId: r.itemId, itemTitle: r.itemTitle, cat: r.cat, photo: r.photo, price: r.price, days: r.days, rent: r.rent, deposit: r.deposit, start: r.start.toISOString().slice(0,10), note: r.note, renterId: r.renterId, renterName: r.renter.name, renterEmail: ['accepted','returned'].includes(r.status) ? r.renter.email : '', ownerId: r.ownerId, ownerName: r.owner.name, ownerEmail: ['accepted','returned'].includes(r.status) ? r.owner.email : '', status: r.status, createdAt: r.createdAt }));
    }
    res.json({ user, items: items.map(i => ({ id: i.id, title: i.title, cat: i.cat, cond: i.cond, price: i.price, deposit: i.deposit, loc: i.loc, desc: i.desc, photo: i.photo, photos: i.photos && i.photos.length ? i.photos : (i.photo ? [i.photo] : []), status: i.status, createdAt: i.createdAt, ownerId: i.ownerId, ownerName: i.owner.name, ownerCollege: i.owner.college, ratingAverage: ratingMap[i.id] ? ratingMap[i.id].ratingAverage : 0, ratingCount: ratingMap[i.id] ? ratingMap[i.id].ratingCount : 0, usersUsedCount: usageGroups.find(g => g.itemId === i.id)?.usersUsedCount || 0 })), rentals });
  } catch (e) { next(e); }
});
module.exports = router;
