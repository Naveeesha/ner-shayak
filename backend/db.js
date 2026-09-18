const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { NODES } = require('./data/nerNetwork');

const db = new Database(path.join(__dirname, 'ner_sahayak.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('driver','field','logistics','official')),
  organisation TEXT,
  vehicleNumber TEXT,
  state TEXT,
  district TEXT,
  language TEXT DEFAULT 'en',
  hub TEXT,
  department TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tone TEXT NOT NULL,
  icon TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  nodeId TEXT,
  road TEXT,
  severity TEXT NOT NULL DEFAULT 'minor',
  createdAt TEXT NOT NULL,
  createdBy TEXT
);

CREATE TABLE IF NOT EXISTS field_reports (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  nodeId TEXT,
  road TEXT,
  fromNode TEXT,
  toNode TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'minor',
  title TEXT NOT NULL,
  description TEXT,
  lat REAL,
  lng REAL,
  photoDataUrl TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  synced INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  vehicleNumber TEXT NOT NULL,
  cargoType TEXT,
  originNode TEXT,
  destinationNode TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  lat REAL,
  lng REAL,
  lastUpdated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  vehicleId TEXT,
  createdBy TEXT NOT NULL,
  originNode TEXT NOT NULL,
  destinationNode TEXT NOT NULL,
  cargoType TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'planned',
  routeJson TEXT,
  etaMinutes INTEGER,
  createdAt TEXT NOT NULL
);
`);

// --- Seed demo accounts (idempotent) ---
const seedUsers = [
  { name: 'Arjun Bora', email: 'arjun@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 01 K 4309', state: 'Assam', district: 'Kamrup Metropolitan', language: 'as' },
  { name: 'Bikram Das', email: 'bikram@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 02 C 8812', state: 'Assam', district: 'Nagaon', language: 'as' },
  { name: 'Chandan Kalita', email: 'chandan@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 06 F 1045', state: 'Assam', district: 'Dibrugarh', language: 'as' },
  { name: 'Dipankar Saikia', email: 'dipankar@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'TR 01 A 5521', state: 'Tripura', district: 'Agartala', language: 'bn' },
  { name: 'Eshaan Chettri', email: 'eshaan@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'SK 04 P 9934', state: 'Sikkim', district: 'Gangtok', language: 'en' },
  { name: 'Farhan Ahmed', email: 'farhan@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'ML 05 D 7710', state: 'Meghalaya', district: 'Shillong', language: 'kha' },
  { name: 'Gautam Gogoi', email: 'gautam@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 03 E 4482', state: 'Assam', district: 'Jorhat', language: 'as' },
  { name: 'Haokip Zou', email: 'haokip@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'MN 01 L 3319', state: 'Manipur', district: 'Imphal', language: 'mni' },
  { name: 'Inaobi Singh', email: 'inaobi@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'NL 07 B 2291', state: 'Nagaland', district: 'Dimapur', language: 'nag' },
  { name: 'Jiten Teron', email: 'jiten@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AR 02 H 6604', state: 'Arunachal Pradesh', district: 'Itanagar', language: 'en' },
  { name: 'Priya Deka', email: 'priya@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit, Nagaon', state: 'Assam', district: 'Nagaon', language: 'as' },
  { name: 'Rohan Sharma', email: 'rohan@ner-sahayak.in', role: 'logistics', organisation: 'NER Freight Movers', hub: 'Khanapara Hub', state: 'Assam', district: 'Kamrup Metropolitan', language: 'hi' },
  { name: 'Ananya Gogoi', email: 'ananya@ner-sahayak.in', role: 'official', organisation: 'DoNER Regional Office', department: 'Disaster Management', state: 'Assam', district: 'Kamrup Metropolitan', language: 'en' },
];


const insertUser = db.prepare(`INSERT OR IGNORE INTO users
  (id,name,email,passwordHash,phone,role,organisation,vehicleNumber,state,district,language,hub,department,createdAt)
  VALUES (@id,@name,@email,@passwordHash,@phone,@role,@organisation,@vehicleNumber,@state,@district,@language,@hub,@department,@createdAt)`);

const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (existing === 0) {
  const passwordHash = bcrypt.hashSync('sahayak123', 8);
  seedUsers.forEach((u) => {
    insertUser.run({
      id: uuid(),
      phone: '+91 90000 00000',
      vehicleNumber: null,
      hub: null,
      department: null,
      ...u,
      passwordHash,
      createdAt: new Date().toISOString(),
    });
  });

  // Seed a couple of alerts
  const insertAlert = db.prepare(`INSERT INTO alerts (id,type,tone,icon,title,text,nodeId,road,severity,createdAt,createdBy)
    VALUES (@id,@type,@tone,@icon,@title,@text,@nodeId,@road,@severity,@createdAt,@createdBy)`);
  insertAlert.run({ id: uuid(), type: 'Weather watch', tone: 'amber', icon: 'cloud', title: 'Heavy rainfall expected near Nagaon', text: 'Plan for slower movement along NH27 this afternoon.', nodeId: 'nagaon', road: 'NH27', severity: 'moderate', createdAt: new Date().toISOString(), createdBy: 'system' });
  insertAlert.run({ id: uuid(), type: 'Route update', tone: 'blue', icon: 'route', title: 'Alternate route via Morigaon clear', text: 'The bypass via Morigaon is available for light vehicles.', nodeId: 'nagaon', road: 'NH27', severity: 'minor', createdAt: new Date().toISOString(), createdBy: 'system' });

  // Seed vehicles for logistics/driver demo
  const insertVehicle = db.prepare(`INSERT INTO vehicles (id,ownerId,vehicleNumber,cargoType,originNode,destinationNode,status,lat,lng,lastUpdated)
    VALUES (@id,@ownerId,@vehicleNumber,@cargoType,@originNode,@destinationNode,@status,@lat,@lng,@lastUpdated)`);
  const owner = db.prepare('SELECT id FROM users WHERE email = ?').get('arjun@ner-sahayak.in');
  const guwahati = NODES.find((n) => n.id === 'guwahati');
  if (!guwahati) throw new Error('Seed data error: guwahati node not found in nerNetwork');
  insertVehicle.run({ id: uuid(), ownerId: owner.id, vehicleNumber: 'AS 01 K 4309', cargoType: 'Medical supplies', originNode: 'guwahati', destinationNode: 'jorhat', status: 'in_transit', lat: guwahati.lat, lng: guwahati.lng, lastUpdated: new Date().toISOString() });
}

module.exports = db;
