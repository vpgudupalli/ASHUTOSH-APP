// Public endpoints used by the marketing website (no sign-in required).
import express from 'express';
import rateLimit from 'express-rate-limit';
import { one, audit } from '../db.js';
import { h, clean, validEmail, ipOf } from '../util.js';
import { notifyAdmins } from '../realtime.js';

const router = express.Router();
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

export const TOPICS = ['Risk Navigator demo', 'Care management services', 'Partnership', 'General question'];

router.post('/contact', contactLimiter, h(async (req, res) => {
  const b = req.body || {};
  // Honeypot: real people never fill the hidden "website" field; bots do.
  if (b.website) return res.json({ ok: true });
  const name = clean(b.name, 120);
  const email = clean(b.email, 200).toLowerCase();
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Please enter your name and a valid email.' });
  const row = await one(
    `INSERT INTO inquiries (name, email, phone, organization, role, topic, message, source_page)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [name, email, clean(b.phone, 40) || null, clean(b.organization, 200) || null, clean(b.role, 120) || null,
      TOPICS.includes(b.topic) ? b.topic : 'General question', clean(b.message, 4000) || null, clean(b.sourcePage, 100) || null]
  );
  audit(null, 'website_inquiry', null, `#${row.id}`, ipOf(req));
  notifyAdmins('inquiry:new', { id: row.id, name, topic: b.topic });
  res.json({ ok: true });
}));

export default router;
