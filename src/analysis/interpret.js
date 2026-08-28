/**
 * interpret.js
 *
 * The "so what" layer. Takes the raw graph-theory output (centrality,
 * components, articulation points) plus asset metadata and produces:
 *
 *   - findings:  ranked, plain-language issues with a recommended action
 *   - posture:   a one-line headline + score for the whole network
 *
 * Nothing here is graph theory for its own sake — every rule answers a
 * question an admin / SOC analyst would actually ask.
 */
import { assetMeta, CRITICALITY_WEIGHT, ZONE_LABELS } from '../domain/assetNetwork';

export const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const SEVERITY_PENALTY = { critical: 22, high: 12, medium: 5, low: 2, info: 0 };

/** Enforcement asset types: cross-zone traffic through these is "controlled". */
const ENFORCEMENT_TYPES = new Set([
  'firewall',
  'domain-controller',
  'network-device',
  'jump-host',
]);
/** Core services a workstation is normally allowed to reach directly. */
const CLIENT_SERVICE_TYPES = new Set(['file-server', 'domain-controller']);

/** Is a cross-zone connection an expected, controlled one? */
function isControlledCrossZone(a, b) {
  if (ENFORCEMENT_TYPES.has(a.type) || ENFORCEMENT_TYPES.has(b.type)) return true;
  const userCore =
    (a.zone === 'user' && b.zone === 'core') ||
    (b.zone === 'user' && a.zone === 'core');
  if (userCore) {
    const coreEnd = a.zone === 'core' ? a : b;
    return CLIENT_SERVICE_TYPES.has(coreEnd.type);
  }
  return false;
}

const pct = (x) => `${Math.round(x * 100)}%`;

/* ------------------------------------------------------------------ *
 * Peer-group baselines: compare an asset to others of the same type   *
 * ------------------------------------------------------------------ */
export function peerBaselines(assets, metricByVertex) {
  const groups = {};
  for (const [id, value] of Object.entries(metricByVertex)) {
    const type = assets[id] ? assets[id].type : 'unknown';
    (groups[type] = groups[type] || []).push(value);
  }
  const stats = {};
  for (const [type, values] of Object.entries(groups)) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance =
      n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    stats[type] = { n, mean, std: Math.sqrt(variance) };
  }
  return stats;
}

function zScore(value, baseline) {
  if (!baseline || !baseline.std) return 0;
  return (value - baseline.mean) / baseline.std;
}

/* ------------------------------------------------------------------ *
 * Individual rules                                                    *
 * ------------------------------------------------------------------ */

function nameList(ids, assets, max = 6) {
  const names = ids.map((id) => (assets[id] ? assets[id].label : id));
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

function criticalityOf(ids, assets) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  ids.forEach((id) => {
    const c = assets[id] ? assets[id].criticality : 'medium';
    counts[c] = (counts[c] || 0) + 1;
  });
  return counts;
}

/** Rule: is inter-zone traffic actually controlled? */
function ruleSegmentation(ctx) {
  const { graph, assets, components } = ctx;
  const findings = [];

  const crossZone = [];
  for (const { from, to } of graph.getEdges()) {
    const a = assets[from];
    const b = assets[to];
    if (!a || !b || a.zone === b.zone) continue;
    if (!isControlledCrossZone(a, b)) {
      crossZone.push({ from, to, za: a.zone, zb: b.zone });
    }
  }

  if (components.count > 1) {
    findings.push({
      category: 'segmentation',
      severity: 'info',
      title: `Network is split into ${components.count} reachable groups`,
      summary: `Assets in different groups cannot reach each other at all. Group sizes: ${components.sizes.join(', ')}.`,
      recommendation:
        'Confirm each split is intentional. An unexpected split can also mean a monitoring collector or management host has lost connectivity.',
      assets: [],
      evidence: { componentSizes: components.sizes },
    });
  }

  const edgeCount = graph.getEdgeCount() || 1;
  if (crossZone.length === 0 && components.count <= 1) {
    findings.push({
      category: 'segmentation',
      severity: 'info',
      title: 'Inter-zone traffic is funnelled through enforcement points',
      summary:
        'Every connection that crosses a zone boundary passes through a firewall, domain controller or network device. This is the desired posture.',
      recommendation: 'Keep firewall rules under change control and review them periodically.',
      assets: [],
      evidence: {},
    });
  } else if (crossZone.length > 0) {
    const ratio = crossZone.length / edgeCount;
    let severity = 'medium';
    if (crossZone.length >= 15 || ratio >= 0.25) severity = 'critical';
    else if (crossZone.length >= 6 || ratio >= 0.15) severity = 'high';
    const pairs = crossZone
      .slice(0, 6)
      .map(
        ({ from, to, za, zb }) =>
          `${assets[from].label} (${ZONE_LABELS[za] || za}) ↔ ${assets[to].label} (${ZONE_LABELS[zb] || zb})`
      );
    findings.push({
      category: 'segmentation',
      severity,
      title: `${crossZone.length} connection${crossZone.length === 1 ? '' : 's'} cross a zone boundary without passing a firewall`,
      summary: `These links let a foothold in one zone reach another directly, bypassing perimeter controls. Examples: ${pairs.join('; ')}.`,
      recommendation:
        'Route this traffic through a firewall or remove it. Prioritise links that touch the DMZ, OT or user LAN.',
      assets: Array.from(
        new Set(crossZone.flatMap(({ from, to }) => [from, to]))
      ),
      evidence: { crossZoneCount: crossZone.length, samplePairs: pairs },
    });
  }

  return findings;
}

/** Rule: single points of failure (articulation points). */
function ruleChokepoints(ctx) {
  const { assets, articulation } = ctx;
  return articulation.map((impact) => {
    const asset = assets[impact.vertex];
    const label = asset ? asset.label : impact.vertex;
    const crit = criticalityOf(impact.isolatedVertices, assets);
    const touchesSensitive = crit.critical + crit.high > 0;
    const severity =
      impact.isolatedAssets >= 5 || touchesSensitive ? 'high' : 'medium';

    const isolatedZones = Array.from(
      new Set(
        impact.isolatedVertices
          .map((id) => (assets[id] ? ZONE_LABELS[assets[id].zone] || assets[id].zone : null))
          .filter(Boolean)
      )
    );

    return {
      category: 'single-point-of-failure',
      severity,
      title: `${label} is a single point of failure`,
      summary: `If ${label} goes offline, ${impact.isolatedAssets} asset${impact.isolatedAssets === 1 ? '' : 's'} lose all connectivity${isolatedZones.length ? ` (${isolatedZones.join(', ')})` : ''}, splitting the network into ${impact.resultingComponents} islands.`,
      recommendation:
        'Add a redundant path or monitored failover for this asset, and give it priority for patching, backups and alerting.',
      assets: [impact.vertex, ...impact.isolatedVertices],
      evidence: {
        isolatedAssets: impact.isolatedAssets,
        isolatedGroups: impact.isolatedGroups,
        isolated: nameList(impact.isolatedVertices, assets, 12),
        resultingComponents: impact.resultingComponents,
      },
    };
  });
}

/** Rule: blast radius of the best-connected assets (closeness + reachability). */
function ruleBlastRadius(ctx) {
  const { assets, closenessRank, reach } = ctx;
  const findings = [];

  const expectedHighReach = [];

  for (const { vertex } of closenessRank.slice(0, 3)) {
    const profile = reach[vertex];
    if (!profile) continue;
    const asset = assets[vertex];
    const meta = assetMeta(asset ? asset.type : 'unknown');
    const within2 = profile.within[2] || 0;
    const label = asset ? asset.label : vertex;

    const expected = meta.criticality === 'critical' || meta.criticality === 'high';
    if (expected) {
      expectedHighReach.push({ vertex, label, within2, reachable: profile.reachableFraction });
    } else {
      findings.push({
        category: 'blast-radius',
        severity: 'high',
        title: `${label} reaches an unusually large share of the network`,
        summary: `${label} is a ${meta.label.toLowerCase()} but sits within 2 hops of ${pct(within2)} of all assets — more like infrastructure than an endpoint.`,
        recommendation:
          'Investigate why this host is so well connected. Check for unexpected services, tunnels or lateral movement, and restrict its access.',
        assets: [vertex],
        evidence: { within2, reachable: profile.reachableFraction },
      });
    }
  }

  if (expectedHighReach.length > 0) {
    const top = expectedHighReach[0];
    findings.push({
      category: 'blast-radius',
      severity: 'info',
      title: 'High-value assets with network-wide reach',
      summary: `${expectedHighReach.map((e) => e.label).join(', ')} can each reach most of the network within 2 hops (e.g. ${top.label}: ${pct(top.within2)}). Expected for infrastructure of this kind, but it makes them the highest-value targets.`,
      recommendation:
        'Ensure these assets have EDR, MFA for administrative access, verbose logging and a fast patch cycle.',
      assets: expectedHighReach.map((e) => e.vertex),
      evidence: Object.fromEntries(expectedHighReach.map((e) => [e.label, `${pct(e.within2)} within 2 hops`])),
    });
  }

  return findings;
}

/** Rule: hubs and peer-group outliers (degree centrality + baselines). */
function ruleHubsAndOutliers(ctx) {
  const { assets, rawDegree, degreeRank, closeness } = ctx;
  const findings = [];
  const reported = new Set();

  const degreeBaseline = peerBaselines(assets, rawDegree);
  const closenessBaseline = peerBaselines(assets, closeness);

  // Baseline "hub" size from the assets that are supposed to be hubs.
  const hubDegrees = Object.keys(rawDegree)
    .filter((id) => assetMeta(assets[id] ? assets[id].type : 'unknown').expectHub)
    .map((id) => rawDegree[id]);
  const hubMean =
    hubDegrees.length > 0
      ? hubDegrees.reduce((a, b) => a + b, 0) / hubDegrees.length
      : 8;
  const hubThreshold = Math.max(8, hubMean * 1.2);

  // Unexpected hubs: an endpoint-type asset with a hub-sized peer count.
  degreeRank.slice(0, 8).forEach(({ vertex }, i) => {
    const asset = assets[vertex];
    const meta = assetMeta(asset ? asset.type : 'unknown');
    if (meta.expectHub) return;
    if ((rawDegree[vertex] || 0) < hubThreshold) return;
    reported.add(vertex);
    findings.push({
      category: 'anomaly',
      severity: 'high',
      title: `Unexpected hub: ${asset ? asset.label : vertex}`,
      summary: `${asset ? asset.label : vertex} (${meta.label.toLowerCase()}) is the #${i + 1} most-connected asset with ${rawDegree[vertex]} direct peers. Endpoints of this type normally have very few.`,
      recommendation:
        'Treat as a possible scanning / lateral-movement host. Review its recent connections, running services and account activity.',
      assets: [vertex],
      evidence: { degree: rawDegree[vertex], rank: i + 1 },
    });
  });

  // Statistical outliers vs same-type peers.
  for (const id of Object.keys(rawDegree)) {
    if (reported.has(id)) continue;
    const asset = assets[id];
    const type = asset ? asset.type : 'unknown';
    const base = degreeBaseline[type];
    if (!base || base.n < 5) continue;
    const z = zScore(rawDegree[id], base);
    if (z < 2.5) continue;
    reported.add(id);
    const meta = assetMeta(type);
    findings.push({
      category: 'anomaly',
      severity: z >= 4 ? 'high' : 'medium',
      title: `${asset ? asset.label : id} is an outlier for its asset class`,
      summary: `${asset ? asset.label : id} has ${rawDegree[id]} connections; ${meta.label.toLowerCase()}s on this network average ${base.mean.toFixed(1)} (±${base.std.toFixed(1)}). That is ${z.toFixed(1)}σ above its peers.`,
      recommendation:
        'Compare against a known-good baseline. Sudden growth in a host’s peer count is a classic lateral-movement indicator.',
      assets: [id],
      evidence: { degree: rawDegree[id], peerMean: base.mean, peerStd: base.std, z },
    });
  }

  // Closeness outliers (a host that can reach far more than its peers).
  for (const id of Object.keys(closeness)) {
    if (reported.has(id)) continue;
    const asset = assets[id];
    const type = asset ? asset.type : 'unknown';
    const base = closenessBaseline[type];
    if (!base || base.n < 5) continue;
    const z = zScore(closeness[id], base);
    if (z < 3) continue;
    reported.add(id);
    const meta = assetMeta(type);
    findings.push({
      category: 'anomaly',
      severity: 'medium',
      title: `${asset ? asset.label : id} can reach the network faster than its peers`,
      summary: `${asset ? asset.label : id} (${meta.label.toLowerCase()}) has ${z.toFixed(1)}σ higher closeness than others of its type, meaning shorter paths to the rest of the network.`,
      recommendation: 'Check for a route, VPN or service that gives this host broader reach than intended.',
      assets: [id],
      evidence: { closeness: closeness[id], peerMean: base.mean, z },
    });
  }

  return findings;
}

/** Rule: critical assets that hang off a single link. */
function ruleFragileCriticalAssets(ctx) {
  const { assets, rawDegree } = ctx;
  const fragileByType = {};
  for (const [id, degree] of Object.entries(rawDegree)) {
    const asset = assets[id];
    if (!asset) continue;
    const weight = CRITICALITY_WEIGHT[asset.criticality] || 1;
    if (weight >= 3 && degree <= 1) {
      (fragileByType[asset.type] = fragileByType[asset.type] || []).push(id);
    }
  }

  const findings = [];
  for (const [type, ids] of Object.entries(fragileByType)) {
    const meta = assetMeta(type);
    if (ids.length > 2) {
      findings.push({
        category: 'resilience',
        severity: 'medium',
        title: `${ids.length} ${meta.label}s each hang off a single link`,
        summary: `${nameList(ids, assets, 10)} are ${meta.criticality}-criticality but have only one network connection each. A single cable, port or switch failure takes them offline.`,
        recommendation: 'Give this segment a redundant uplink, and confirm monitoring reaches each device independently.',
        assets: ids,
        evidence: { count: ids.length },
      });
    } else {
      ids.forEach((id) => {
        findings.push({
          category: 'resilience',
          severity: 'medium',
          title: `${assets[id].label} depends on a single connection`,
          summary: `${assets[id].label} is a ${assets[id].criticality}-criticality asset with only one network link. Any failure on that path takes it offline.`,
          recommendation: 'Provision a second uplink / NIC path and confirm monitoring reaches it independently.',
          assets: [id],
          evidence: { degree: rawDegree[id] },
        });
      });
    }
  }
  return findings;
}

/** Rule: isolated segments with no management / identity presence. */
function ruleBlindSegments(ctx) {
  const { assets, components } = ctx;
  if (components.count <= 1) return [];
  const findings = [];
  components.components.forEach((group, idx) => {
    const hasMgmt = group.some((id) => {
      const t = assets[id] ? assets[id].type : null;
      return t === 'domain-controller' || t === 'jump-host' || t === 'network-device';
    });
    if (!hasMgmt && group.length > 1) {
      findings.push({
        category: 'visibility',
        severity: 'medium',
        title: `Segment ${idx + 1} has no management or identity host`,
        summary: `The group [${nameList(group, assets, 8)}] contains no domain controller, jump host or managed switch. It is likely a monitoring blind spot.`,
        recommendation: 'Extend log collection / EDR coverage to this segment or connect it through a monitored gateway.',
        assets: group,
        evidence: { size: group.length },
      });
    }
  });
  return findings;
}

/* ------------------------------------------------------------------ *
 * Orchestration                                                       *
 * ------------------------------------------------------------------ */

const RULES = [
  ruleSegmentation,
  ruleChokepoints,
  ruleBlastRadius,
  ruleHubsAndOutliers,
  ruleFragileCriticalAssets,
  ruleBlindSegments,
];

/**
 * @param {object} ctx {
 *   graph, assets, stats, components,
 *   degree, closeness, degreeRank, closenessRank, rawDegree,
 *   articulation,   // articulationImpact() output
 *   reach,          // { [vertex]: reachabilityProfile }
 * }
 * @returns {{ findings: Array, posture: object, riskByVertex: object }}
 */
export function interpret(ctx) {
  let findings = [];
  for (const rule of RULES) {
    try {
      findings = findings.concat(rule(ctx) || []);
    } catch (e) {
      // A broken rule should never take down the whole report.
      findings.push({
        category: 'internal',
        severity: 'info',
        title: 'A rule could not be evaluated',
        summary: String(e && e.message ? e.message : e),
        recommendation: '',
        assets: [],
        evidence: {},
      });
    }
  }

  findings.sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );
  findings = findings.map((f, i) => ({ id: `F${i + 1}`, ...f }));

  const posture = computePosture(findings, ctx);
  const riskByVertex = buildRiskMap(findings);

  return { findings, posture, riskByVertex };
}

export function computePosture(findings, ctx) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f) => {
    counts[f.severity] += 1;
  });

  let score = 100;
  findings.forEach((f) => {
    score -= SEVERITY_PENALTY[f.severity] || 0;
  });
  score = Math.max(0, Math.min(100, Math.round(score)));

  const rating =
    score >= 75 ? 'Healthy' : score >= 45 ? 'Needs attention' : 'At risk';

  const chokepoints = ctx.articulation.length;
  const anomalies = findings.filter((f) => f.category === 'anomaly').length;
  const flatFinding = findings.find(
    (f) =>
      f.category === 'segmentation' &&
      (f.severity === 'critical' || f.severity === 'high')
  );
  let segmentDesc;
  if (ctx.components.count > 1) {
    segmentDesc = `${ctx.components.count} isolated segments`;
  } else if (flatFinding) {
    segmentDesc = 'flat network — zones not enforced';
  } else {
    segmentDesc = 'single network, zones enforced';
  }

  const headline = `${segmentDesc} · ${chokepoints} single point${chokepoints === 1 ? '' : 's'} of failure · ${anomalies} anomalous asset${anomalies === 1 ? '' : 's'}`;

  const topIssue = findings.find(
    (f) => f.severity === 'critical' || f.severity === 'high'
  );
  const summary =
    `Scanned ${ctx.stats.vertexCount} assets and ${ctx.stats.edgeCount} connections. ` +
    (topIssue
      ? `Most urgent: ${topIssue.title.toLowerCase()}.`
      : 'No high-severity issues found.');

  return { score, rating, headline, summary, counts };
}

function buildRiskMap(findings) {
  const risk = {};
  findings.forEach((f) => {
    (f.assets || []).forEach((id) => {
      if (
        !risk[id] ||
        SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[risk[id]]
      ) {
        risk[id] = f.severity;
      }
    });
  });
  return risk;
}

/**
 * On-demand description of a single asset (used when a node is clicked).
 */
export function describeAsset(ctx, id) {
  const asset = ctx.assets[id];
  const meta = assetMeta(asset ? asset.type : 'unknown');
  const profile = ctx.reach[id];
  const choke = ctx.articulation.find((a) => a.vertex === id);

  return {
    id,
    label: asset ? asset.label : id,
    typeLabel: meta.label,
    zoneLabel: ZONE_LABELS[asset ? asset.zone : 'unknown'] || 'Unclassified',
    criticality: asset ? asset.criticality : 'medium',
    degree: ctx.rawDegree[id] || 0,
    degreeCentrality: ctx.degree[id] || 0,
    closeness: ctx.closeness[id] || 0,
    reachWithin2: profile ? profile.within[2] : null,
    reachableFraction: profile ? profile.reachableFraction : null,
    isChokepoint: Boolean(choke),
    isolatesOnFailure: choke ? choke.isolatedAssets : 0,
  };
}

export default interpret;
