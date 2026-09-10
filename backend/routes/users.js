const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function toPublicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// GET /api/users — directory of every registered account.
// Restricted to 'official' role, since this is regional oversight data
// (names, contact info, postings) that shouldn't be visible to every driver.
router.get('/', requireAuth, requireRole('official'), (req, res) => {
  const { role, state, search } = req.query;
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  if (role) { sql += ' AND role = ?'; params.push(role); }
  if (state) { sql += ' AND state = ?'; params.push(state); }
  if (search) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR organisation LIKE ? OR district LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY createdAt DESC';
  const users = db.prepare(sql).all(...params).map(toPublicUser);

  const counts = db.prepare('SELECT role, COUNT(*) c FROM users GROUP BY role').all();
  const byRole = Object.fromEntries(counts.map((r) => [r.role, r.c]));

  res.json({ users, total: users.length, byRole });
});

// GET /api/users/:id — full detail on one account (official only)
router.get('/:id', requireAuth, requireRole('official'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: toPublicUser(user) });
});

module.exports = router;
