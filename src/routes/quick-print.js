const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const shopInput = z.object({
  title: z.string().trim().min(3).max(80),
  address: z.string().trim().min(3).max(180),
  phone: z.string().trim().regex(/^[+0-9() -]{8,20}$/, 'Enter a valid phone number.'),
  normalRate: z.coerce.number().int().min(1).max(100),
  quickRate: z.coerce.number().int().min(1).max(150),
  etaMinutes: z.coerce.number().int().min(1).max(240).default(10)
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const college = String(req.user.college || '').trim();
    if (!college) return res.json({ shops: [] });
    const rows = await prisma.accommodation.findMany({
      where: { type: 'PRINT_SHOP', college, status: 'available' },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ shops: rows.map(formatShop) });
  } catch (error) { next(error); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const college = String(req.user.college || '').trim();
    if (!college) return res.status(400).json({ error: 'Add your college to your account before listing a print shop.' });
    const parsed = shopInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (parsed.data.quickRate <= parsed.data.normalRate) return res.status(400).json({ error: 'Quick Print rate must be higher than the normal rate.' });
    const shop = await prisma.accommodation.create({
      data: {
        type: 'PRINT_SHOP', title: parsed.data.title, address: parsed.data.address,
        distanceKm: parsed.data.quickRate, price: parsed.data.normalRate, priceUnit: 'PAGE',
        totalRooms: 1, vacantRooms: 1, totalBeds: 0, vacantBeds: 0,
        description: JSON.stringify({ ownerName: req.user.name, etaMinutes: parsed.data.etaMinutes }),
        contactPhone: parsed.data.phone, photos: [], college, ownerId: req.user.id, status: 'pending'
      }
    });
    res.status(201).json({ shop: formatShop(shop) });
  } catch (error) { next(error); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const shop = await prisma.accommodation.findFirst({ where: { id: req.params.id, type: 'PRINT_SHOP' } });
    if (!shop || shop.ownerId !== req.user.id) return res.status(404).json({ error: 'Print shop listing not found.' });
    await prisma.accommodation.delete({ where: { id: shop.id } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

function formatShop(shop) {
  let details = {};
  try { details = shop.description ? JSON.parse(shop.description) : {}; } catch (_) {}
  return {
    id: shop.id, title: shop.title, address: shop.address, phone: shop.contactPhone,
    normalRate: shop.price, quickRate: Number(shop.distanceKm), etaMinutes: details.etaMinutes || 10,
    college: shop.college, status: shop.status, ownerId: shop.ownerId,
    ownerName: details.ownerName || '', createdAt: shop.createdAt
  };
}
module.exports = router;
