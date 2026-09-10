const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = req.user.role === 'driver'
    ? db.prepare('SELECT * FROM vehicles WHERE ownerId = ?').all(req.user.id)
    : db.prepare('SELECT * FROM vehicles ORDER BY lastUpdated DESC').all();
  res.json({ vehicles: rows });
});

router.post('/', requireAuth, (req, res) => {
  const { vehicleNumber, cargoType, originNode, destinationNode, lat, lng } = req.body || {};
  if (!vehicleNumber || !originNode || !destinationNode) {
    return res.status(400).json({ error: 'vehicleNumber, originNode and destinationNode are required' });
  }
  const vehicle = {
    id: uuid(),
    ownerId: req.user.id,
    vehicleNumber,
    cargoType: cargoType || 'General cargo',
    originNode,
    destinationNode,
    status: 'in_transit',
    lat: lat ?? null,
    lng: lng ?? null,
    lastUpdated: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO vehicles (id,ownerId,vehicleNumber,cargoType,originNode,destinationNode,status,lat,lng,lastUpdated)
    VALUES (@id,@ownerId,@vehicleNumber,@cargoType,@originNode,@destinationNode,@status,@lat,@lng,@lastUpdated)`).run(vehicle);
  res.status(201).json({ vehicle });
});

// GPS ping — called periodically by the driver's device/app to update live location
router.post('/:id/ping', requireAuth, (req, res) => {
  const { lat, lng, status } = req.body || {};
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng are required' });
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  db.prepare('UPDATE vehicles SET lat = ?, lng = ?, status = COALESCE(?, status), lastUpdated = ? WHERE id = ?')
    .run(lat, lng, status || null, new Date().toISOString(), req.params.id);
  const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  res.json({ vehicle: updated });
});

module.exports = router;
