const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function toPublicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

// GET /api/users — directory of every registered account (Official/Admin only)
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

// PATCH /api/users/:id — update user details (Official/Admin only)
router.patch('/:id', requireAuth, requireRole('official'), (req, res) => {
  const allowed = ['name', 'phone', 'role', 'organisation', 'vehicleNumber', 'state', 'district', 'language', 'hub', 'department'];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });
  if (updates.role && !['driver', 'field', 'logistics', 'official'].includes(updates.role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json({ user: toPublicUser(updated) });
});

// DELETE /api/users/:id — delete a user account (Official/Admin only)
router.delete('/:id', requireAuth, requireRole('official'), (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ error: 'You cannot delete your own account from the directory.' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true, deletedId: req.params.id });
});

module.exports = router;
