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

module.exports = router;
