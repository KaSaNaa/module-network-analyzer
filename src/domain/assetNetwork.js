/**
 * assetNetwork.js
 *
 * Domain layer for the Network Analysis module: turns a bare Graph into an
 * "IT asset / connectivity graph" that a sysadmin or SOC analyst recognises.
 *
 * A generated network is returned as { graph, assets } where:
 *   graph  -> Graph instance (vertex ids are asset ids like "DC-01")
 *   assets -> { [id]: { id, label, type, zone, criticality } }
 */
import Graph from '../data-structures/Graph';
import { makeRng } from '../utils/testDataGenerator';

/** Asset type catalogue. `enforcement` = a device that is expected to sit
 *  between zones (cross-zone traffic through it is "controlled"). */
export const ASSET_TYPES = {
  'domain-controller': { label: 'Domain Controller', zone: 'core', criticality: 'critical', expectHub: true, enforcement: true },
  'file-server': { label: 'File Server', zone: 'core', criticality: 'high', expectHub: true, enforcement: false },
  database: { label: 'Database', zone: 'core', criticality: 'high', expectHub: false, enforcement: false },
  'app-server': { label: 'Application Server', zone: 'core', criticality: 'medium', expectHub: false, enforcement: false },
  'web-server': { label: 'Web Server', zone: 'dmz', criticality: 'medium', expectHub: false, enforcement: false },
  firewall: { label: 'Firewall', zone: 'perimeter', criticality: 'high', expectHub: true, enforcement: true },
  'jump-host': { label: 'Jump Host', zone: 'mgmt', criticality: 'high', expectHub: true, enforcement: true },
  'network-device': { label: 'Switch / Router', zone: 'infra', criticality: 'high', expectHub: true, enforcement: true },
  workstation: { label: 'Workstation', zone: 'user', criticality: 'low', expectHub: false, enforcement: false },
  'ot-device': { label: 'OT / ICS Device', zone: 'ot', criticality: 'high', expectHub: false, enforcement: false },
  unknown: { label: 'Unknown Asset', zone: 'unknown', criticality: 'medium', expectHub: false, enforcement: false },
};

export const CRITICALITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

export const ZONE_LABELS = {
  core: 'Core / Servers',
  user: 'User LAN',
  dmz: 'DMZ',
  perimeter: 'Perimeter',
  mgmt: 'Management',
  infra: 'Network Infra',
  ot: 'OT / ICS',
  unknown: 'Unclassified',
};

export function assetMeta(type) {
  return ASSET_TYPES[type] || ASSET_TYPES.unknown;
}

/** Build the { id, label, type, zone, criticality } record for an asset. */
function makeAsset(id, type) {
  const meta = assetMeta(type);
  return { id, label: id, type, zone: meta.zone, criticality: meta.criticality };
}

/**
 * Generate an enterprise IT network.
 *
 * @param {object} options
 *   workstations   number of user workstations (default 24)
 *   segmented      route DMZ / OT through choke points (default true)
 *   includeOT      attach an OT/ICS segment behind the jump host (default true)
 *   flat           add many uncontrolled cross-zone links (default false)
 *   injectAnomaly  add one workstation that behaves like a scanner (default false)
 *   seed           RNG seed for reproducibility
 */
export function buildEnterpriseNetwork(options = {}) {
  const {
    workstations = 24,
    segmented = true,
    includeOT = true,
    flat = false,
    injectAnomaly = false,
    seed = 1234,
  } = options;

  const rng = makeRng(seed);
  const graph = new Graph(false);
  const assets = {};

  const add = (id, type) => {
    assets[id] = makeAsset(id, type);
    graph.addVertex(id);
    return id;
  };
  const link = (a, b) => graph.addEdge(a, b);

  // --- Core (redundant core switches) --------------------------------
  const dc1 = add('DC-01', 'domain-controller');
  const dc2 = add('DC-02', 'domain-controller');
  const file1 = add('FILE-01', 'file-server');
  const db1 = add('DB-01', 'database');
  const app1 = add('APP-01', 'app-server');
  const core1 = add('SW-CORE-01', 'network-device');
  const core2 = add('SW-CORE-02', 'network-device');

  link(core1, core2);
  link(dc1, dc2);
  [dc1, dc2, file1, db1, app1].forEach((s) => {
    link(s, core1);
    link(s, core2);
  });
  link(app1, db1);

  // --- Management ----------------------------------------------------
  const jump1 = add('JUMP-01', 'jump-host');
  link(jump1, core1);
  link(jump1, core2);
  link(jump1, dc1);

  // --- Perimeter + DMZ --------------------------------------------------
  const fw1 = add('FW-01', 'firewall');
  const web1 = add('WEB-01', 'web-server');
  const web2 = add('WEB-02', 'web-server');
  link(fw1, core1); // core side (redundant)
  link(fw1, core2);
  link(web1, fw1);
  link(web2, fw1);
  link(web1, web2);
  if (!segmented) {
    // Uncontrolled: DMZ hosts talk straight to the database.
    link(web1, db1);
    link(web2, db1);
  }

  // --- OT / ICS segment ----------------------------------------------
  if (includeOT) {
    const otSwitch = add('SW-OT-01', 'network-device');
    assets[otSwitch].zone = 'ot';
    link(otSwitch, jump1); // only path in (segmented)
    for (let i = 1; i <= 4; i++) {
      const ot = add(`OT-${String(i).padStart(2, '0')}`, 'ot-device');
      link(ot, otSwitch);
    }
    if (!segmented) {
      link(otSwitch, db1);
    }
  }

  // --- User workstations -------------------------------------------------
  const wsIds = [];
  for (let i = 1; i <= workstations; i++) {
    const ws = add(`WS-${String(i).padStart(3, '0')}`, 'workstation');
    wsIds.push(ws);
    // Authentication + file access (normal cross-zone traffic through a DC).
    link(ws, rng() < 0.5 ? dc1 : dc2);
    link(ws, file1);
    // Sparse peer-to-peer links within the LAN.
    if (i > 1 && rng() < 0.12) {
      link(ws, wsIds[Math.floor(rng() * (wsIds.length - 1))]);
    }
  }

  if (flat) {
    // Simulate a poorly segmented network: workstations reach servers and
    // DMZ directly, and many extra peer links.
    for (const ws of wsIds) {
      if (rng() < 0.35) link(ws, db1);
      if (rng() < 0.25) link(ws, app1);
      if (rng() < 0.15) link(ws, web1);
      if (rng() < 0.3) link(ws, wsIds[Math.floor(rng() * wsIds.length)]);
    }
  }

  if (injectAnomaly && wsIds.length > 6) {
    // One workstation that talks to an abnormal number of peers -> looks
    // like host discovery / lateral movement.
    const scanner = wsIds[Math.floor(wsIds.length / 2)];
    assets[scanner] = { ...assets[scanner], label: `${scanner}` };
    const targets = new Set();
    while (targets.size < Math.min(12, wsIds.length - 1)) {
      const t = wsIds[Math.floor(rng() * wsIds.length)];
      if (t !== scanner) targets.add(t);
    }
    targets.forEach((t) => link(scanner, t));
    link(scanner, db1);
    link(scanner, app1);
  }

  return { graph, assets };
}

/**
 * Wrap an arbitrary Graph (e.g. one loaded from JSON with no metadata) so the
 * rest of the pipeline can still run.
 */
export function assetsFromGraph(graph) {
  const assets = {};
  for (const id of graph.getVertices()) {
    assets[id] = makeAsset(id, 'unknown');
  }
  return assets;
}

/** Named presets for the UI dropdown. Each returns { graph, assets }. */
export const NETWORK_PRESETS = {
  segmented: {
    label: 'Segmented enterprise + OT (24 workstations)',
    build: () => buildEnterpriseNetwork({ seed: 1234 }),
  },
  smallOffice: {
    label: 'Small office (10 workstations)',
    build: () => buildEnterpriseNetwork({ workstations: 10, includeOT: false, seed: 77 }),
  },
  flat: {
    label: 'Flat network — weak segmentation (30 workstations)',
    build: () => buildEnterpriseNetwork({ workstations: 30, segmented: false, flat: true, seed: 555 }),
  },
  incident: {
    label: 'Enterprise with anomalous host (28 workstations)',
    build: () => buildEnterpriseNetwork({ workstations: 28, injectAnomaly: true, seed: 909 }),
  },
};

export default { buildEnterpriseNetwork, assetsFromGraph, NETWORK_PRESETS, ASSET_TYPES };
