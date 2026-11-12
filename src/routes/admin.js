const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/activity', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [totalUsers, verifiedUsers, totalSignups, totalLogins, totalLogouts, todaySignups, todayLogins, users, activities, lastLogins] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.userActivity.count({ where: { event: 'signup' } }),
      prisma.userActivity.count({ where: { event: 'login' } }),
      prisma.userActivity.count({ where: { event: 'logout' } }),
      prisma.userActivity.count({ where: { event: 'signup', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      prisma.userActivity.count({ where: { event: 'login', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, name: true, college: true, email: true, emailVerified: true, createdAt: true } }),
      prisma.userActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, userId: true, name: true, college: true, email: true, event: true, createdAt: true } }),
      prisma.userActivity.groupBy({ by: ['userId'], where: { event: 'login', userId: { not: null } }, _max: { createdAt: true } })
    ]);
    const loginMap = Object.fromEntries(lastLogins.filter(x => x.userId).map(x => [x.userId, x._max.createdAt]));
    res.json({ summary: { totalUsers, verifiedUsers, totalSignups, totalLogins, totalLogouts, todaySignups, todayLogins }, users: users.map(u => ({ ...u, lastLoginAt: loginMap[u.id] || null })), activities });
  } catch (error) { next(error); }
});

module.exports = router;
