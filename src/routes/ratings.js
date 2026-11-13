const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/:itemId', async (req, res, next) => {
  try {
    const item = await prisma.item.findUnique({ where: { id: req.params.itemId }, select: { id: true, status: true } });
    if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Listing not found.' });
    const summary = await prisma.itemRating.aggregate({ where: { itemId: item.id }, _avg: { stars: true }, _count: { _all: true } });
    let myRating = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      try {
        const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        const mine = await prisma.itemRating.findUnique({ where: { itemId_userId: { itemId: item.id, userId: payload.sub } }, select: { stars: true } });
        myRating = mine ? mine.stars : null;
      } catch (_) {}
    }
    res.json({ average: summary._avg.stars ? Number(summary._avg.stars.toFixed(1)) : 0, count: summary._count._all, myRating });
  } catch (e) { next(e); }
});

router.put('/:itemId', requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ stars: z.number().int().min(1).max(5) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a rating from 1 to 5 stars.' });
    const item = await prisma.item.findUnique({ where: { id: req.params.itemId }, select: { id: true, ownerId: true, status: true } });
    if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Listing not found.' });
    if (item.ownerId === req.user.id) return res.status(403).json({ error: 'You cannot rate your own listing.' });
    const rating = await prisma.itemRating.upsert({
      where: { itemId_userId: { itemId: item.id, userId: req.user.id } },
      create: { itemId: item.id, userId: req.user.id, stars: parsed.data.stars },
      update: { stars: parsed.data.stars }
    });
    const summary = await prisma.itemRating.aggregate({ where: { itemId: item.id }, _avg: { stars: true }, _count: { _all: true } });
    res.json({ ok: true, myRating: rating.stars, average: Number(summary._avg.stars.toFixed(1)), count: summary._count._all });
  } catch (e) { next(e); }
});

module.exports = router;
