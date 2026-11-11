# Before inviting real students

- [ ] Use a managed PostgreSQL database with automated backups.
- [ ] Set a unique production `JWT_SECRET` and HTTPS.
- [ ] Use persistent object storage for uploaded images.
- [ ] Configure rate limits and monitoring for your expected campus traffic.
- [ ] Add email verification and password reset.
- [ ] Add an admin/moderation process for unsafe, prohibited, or misleading listings.
- [ ] Publish clear rental, deposit, damage, cancellation, and dispute policies.
- [ ] Add future-date availability checks if advance bookings should overlap safely.
- [ ] Consider HttpOnly cookie sessions instead of localStorage JWTs.
- [ ] Test owner/renter permissions using two separate accounts.
