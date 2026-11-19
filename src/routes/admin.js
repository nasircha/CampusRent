const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/activity', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [totalUsers, verifiedUsers, totalSignups, users, activities, lastLogins, userEvents] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.userActivity.count({ where: { event: 'signup' } }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, college: true, email: true, emailVerified: true, createdAt: true } }),
      prisma.userActivity.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, userId: true, name: true, college: true, email: true, event: true, createdAt: true } }),
      prisma.userActivity.groupBy({ by: ['userId'], where: { event: 'login', userId: { not: null } }, _max: { createdAt: true } }),
      prisma.userActivity.groupBy({ by: ['userId', 'event'], where: { userId: { not: null }, event: { in: ['login', 'logout'] } }, _max: { createdAt: true } })
    ]);
    const loginMap = Object.fromEntries(lastLogins.filter(x => x.userId).map(x => [x.userId, x._max.createdAt]));
    const presenceMap = {};
    userEvents.forEach(x => {
      if (!x.userId || !x._max.createdAt) return;
      const current = presenceMap[x.userId];
      if (!current || new Date(x._max.createdAt) > new Date(current.lastActivityAt)) {
        presenceMap[x.userId] = {
          status: x.event === 'login' ? 'logged_in' : 'logged_out',
          lastActivityAt: x._max.createdAt
        };
      }
    });
    const enrichedUsers = users.map(u => ({
      ...u,
      lastLoginAt: loginMap[u.id] || null,
      presence: presenceMap[u.id]?.status || 'logged_out',
      lastActivityAt: presenceMap[u.id]?.lastActivityAt || null
    }));
    const loggedInNow = enrichedUsers.filter(u => u.presence === 'logged_in').length;
    res.json({
      summary: { totalUsers, verifiedUsers, totalSignups, loggedInNow, loggedOut: totalUsers - loggedInNow },
      users: enrichedUsers,
      activities
    });
  } catch (error) { next(error); }
});


router.get('/stays', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const stays = await prisma.accommodation.findMany({
      where: { type: { not: 'PRINT_SHOP' }, status: { in: ['pending', 'available', 'rejected'] } },
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    });
    res.json({ stays: stays.map(s => ({
      id: s.id, type: s.type, title: s.title, address: s.address, distanceKm: s.distanceKm,
      price: s.price, priceUnit: s.priceUnit, totalRooms: s.totalRooms, vacantRooms: s.vacantRooms,
      totalBeds: s.totalBeds, vacantBeds: s.vacantBeds, description: s.description,
      contactPhone: s.contactPhone, photos: s.photos || [], college: s.college, status: s.status,
      ownerId: s.ownerId, ownerName: s.owner?.name || '', ownerEmail: s.owner?.email || '', createdAt: s.createdAt
    })) });
  } catch (error) { next(error); }
});

router.patch('/stays/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || '');
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Choose approve or reject.' });
    const stay = await prisma.accommodation.findUnique({ where: { id: req.params.id } });
    if (!stay) return res.status(404).json({ error: 'Accommodation listing not found.' });
    const updated = await prisma.accommodation.update({
      where: { id: stay.id },
      data: { status: decision === 'approve' ? 'available' : 'rejected' }
    });
    res.json({ ok: true, status: updated.status });
  } catch (error) { next(error); }
});

module.exports = router;


router.get('/quick-print', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const shops = await prisma.accommodation.findMany({
      where: { type: 'PRINT_SHOP', status: { in: ['pending', 'available', 'rejected'] } },
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    });
    res.json({ shops: shops.map(formatPrintShop) });
  } catch (error) { next(error); }
});

router.patch('/quick-print/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || '');
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Choose approve or reject.' });
    const shop = await prisma.accommodation.findFirst({ where: { id: req.params.id, type: 'PRINT_SHOP' } });
    if (!shop) return res.status(404).json({ error: 'Print shop listing not found.' });
    const updated = await prisma.accommodation.update({
      where: { id: shop.id },
      data: { status: decision === 'approve' ? 'available' : 'rejected' }
    });
    res.json({ ok: true, status: updated.status });
  } catch (error) { next(error); }
});

function formatPrintShop(shop) {
  let details = {};
  try { details = shop.description ? JSON.parse(shop.description) : {}; } catch (_) {}
  return {
    id: shop.id, title: shop.title, address: shop.address, phone: shop.contactPhone,
    normalRate: shop.price, quickRate: Number(shop.distanceKm), etaMinutes: details.etaMinutes || 10,
    photos: shop.photos || [], college: shop.college, status: shop.status,
    ownerId: shop.ownerId, ownerName: details.ownerName || shop.owner?.name || '',
    ownerEmail: shop.owner?.email || '', createdAt: shop.createdAt
  };
}
