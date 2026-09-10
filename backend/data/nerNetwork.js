// Road network graph for the North Eastern Region (NER) of India.
// Nodes = towns/cities/logistics hubs with real approximate coordinates.
// Edges = real highway/road corridors with base distance (km) and a
// static terrain-difficulty factor (higher = harder terrain, more
// landslide/flood prone). This is combined at request time with LIVE
// weather data + active disruption reports to compute a dynamic risk
// score used by the Dijkstra route optimizer.

const NODES = [
  { id: 'guwahati',    name: 'Guwahati',    state: 'Assam',            lat: 26.1445, lng: 91.7362, type: 'hub' },
  { id: 'tezpur',      name: 'Tezpur',      state: 'Assam',            lat: 26.6528, lng: 92.7926, type: 'town' },
  { id: 'nagaon',      name: 'Nagaon',      state: 'Assam',            lat: 26.3480, lng: 92.6840, type: 'town' },
  { id: 'jorhat',      name: 'Jorhat',      state: 'Assam',            lat: 26.7509, lng: 94.2037, type: 'town' },
  { id: 'dibrugarh',   name: 'Dibrugarh',   state: 'Assam',            lat: 27.4728, lng: 94.9120, type: 'hub' },
  { id: 'silchar',     name: 'Silchar',     state: 'Assam',            lat: 24.8333, lng: 92.7789, type: 'hub' },
  { id: 'karimganj',   name: 'Karimganj',   state: 'Assam',            lat: 24.8697, lng: 92.3576, type: 'town' },
  { id: 'shillong',    name: 'Shillong',    state: 'Meghalaya',        lat: 25.5788, lng: 91.8933, type: 'hub' },
  { id: 'tura',        name: 'Tura',        state: 'Meghalaya',        lat: 25.5138, lng: 90.2201, type: 'town' },
  { id: 'jowai',       name: 'Jowai',       state: 'Meghalaya',        lat: 25.4500, lng: 92.2000, type: 'town' },
  { id: 'kohima',      name: 'Kohima',      state: 'Nagaland',         lat: 25.6751, lng: 94.1086, type: 'hub' },
  { id: 'dimapur',     name: 'Dimapur',     state: 'Nagaland',         lat: 25.9091, lng: 93.7266, type: 'hub' },
  { id: 'mokokchung',  name: 'Mokokchung',  state: 'Nagaland',         lat: 26.3260, lng: 94.5300, type: 'town' },
  { id: 'imphal',      name: 'Imphal',      state: 'Manipur',          lat: 24.8170, lng: 93.9368, type: 'hub' },
  { id: 'churachandpur',name:'Churachandpur',state: 'Manipur',         lat: 24.3333, lng: 93.6833, type: 'town' },
  { id: 'aizawl',      name: 'Aizawl',      state: 'Mizoram',          lat: 23.7271, lng: 92.7176, type: 'hub' },
  { id: 'lunglei',     name: 'Lunglei',     state: 'Mizoram',          lat: 22.8879, lng: 92.7320, type: 'town' },
  { id: 'agartala',    name: 'Agartala',    state: 'Tripura',          lat: 23.8315, lng: 91.2868, type: 'hub' },
  { id: 'udaipur_tr',  name: 'Udaipur',     state: 'Tripura',          lat: 23.5333, lng: 91.4833, type: 'town' },
  { id: 'itanagar',    name: 'Itanagar',    state: 'Arunachal Pradesh',lat: 27.0844, lng: 93.6053, type: 'hub' },
  { id: 'ziro',        name: 'Ziro',        state: 'Arunachal Pradesh',lat: 27.5486, lng: 93.8250, type: 'town' },
  { id: 'pasighat',    name: 'Pasighat',    state: 'Arunachal Pradesh',lat: 28.0667, lng: 95.3333, type: 'town' },
  { id: 'tawang',      name: 'Tawang',      state: 'Arunachal Pradesh',lat: 27.5859, lng: 91.8594, type: 'town' },
  { id: 'gangtok',     name: 'Gangtok',     state: 'Sikkim',           lat: 27.3389, lng: 88.6065, type: 'hub' },
  { id: 'siliguri',    name: 'Siliguri',    state: 'West Bengal (gateway)', lat: 26.7271, lng: 88.3953, type: 'hub' },
];

// Edges reference real highway corridors (NH27, NH37, NH2, NH6, NH15, NH702 etc.)
// terrainFactor: 1.0 (plains, easy) -> 2.2 (extreme hill/border terrain)
const EDGES = [
  { from: 'guwahati', to: 'tezpur', km: 182, terrainFactor: 1.15, road: 'NH15' },
  { from: 'tezpur', to: 'jorhat', km: 226, terrainFactor: 1.2, road: 'NH15' },
  { from: 'jorhat', to: 'dibrugarh', km: 133, terrainFactor: 1.1, road: 'NH37' },
  { from: 'guwahati', to: 'nagaon', km: 117, terrainFactor: 1.05, road: 'NH27' },
  { from: 'nagaon', to: 'jorhat', km: 208, terrainFactor: 1.15, road: 'NH27' },
  { from: 'guwahati', to: 'shillong', km: 100, terrainFactor: 1.5, road: 'NH6' },
  { from: 'shillong', to: 'jowai', km: 64, terrainFactor: 1.4, road: 'NH6' },
  { from: 'jowai', to: 'silchar', km: 168, terrainFactor: 1.7, road: 'NH6' },
  { from: 'shillong', to: 'tura', km: 220, terrainFactor: 1.6, road: 'SH' },
  { from: 'guwahati', to: 'tura', km: 300, terrainFactor: 1.4, road: 'NH27' },
  { from: 'silchar', to: 'karimganj', km: 58, terrainFactor: 1.1, road: 'NH37' },
  { from: 'silchar', to: 'aizawl', km: 180, terrainFactor: 1.9, road: 'NH306' },
  { from: 'aizawl', to: 'lunglei', km: 120, terrainFactor: 1.8, road: 'NH54' },
  { from: 'silchar', to: 'agartala', km: 220, terrainFactor: 1.6, road: 'NH8' },
  { from: 'agartala', to: 'udaipur_tr', km: 55, terrainFactor: 1.1, road: 'NH8' },
  { from: 'agartala', to: 'karimganj', km: 130, terrainFactor: 1.4, road: 'NH8' },
  { from: 'nagaon', to: 'dimapur', km: 210, terrainFactor: 1.3, road: 'NH36' },
  { from: 'dimapur', to: 'kohima', km: 74, terrainFactor: 1.7, road: 'NH29' },
  { from: 'kohima', to: 'imphal', km: 141, terrainFactor: 1.9, road: 'NH2' },
  { from: 'dimapur', to: 'imphal', km: 215, terrainFactor: 1.6, road: 'NH2' },
  { from: 'imphal', to: 'churachandpur', km: 65, terrainFactor: 1.7, road: 'NH150' },
  { from: 'dimapur', to: 'mokokchung', km: 162, terrainFactor: 1.6, road: 'SH' },
  { from: 'jorhat', to: 'itanagar', km: 160, terrainFactor: 1.6, road: 'NH415' },
  { from: 'itanagar', to: 'ziro', km: 115, terrainFactor: 1.9, road: 'NH13' },
  { from: 'dibrugarh', to: 'pasighat', km: 145, terrainFactor: 1.7, road: 'NH515' },
  { from: 'tezpur', to: 'tawang', km: 320, terrainFactor: 2.2, road: 'NH13' },
  { from: 'guwahati', to: 'siliguri', km: 275, terrainFactor: 1.2, road: 'NH27' },
  { from: 'siliguri', to: 'gangtok', km: 114, terrainFactor: 1.9, road: 'NH10' },
];

module.exports = { NODES, EDGES };
