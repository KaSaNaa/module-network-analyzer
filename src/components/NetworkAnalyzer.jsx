import React, { useCallback, useMemo, useState } from 'react';
import {
  NETWORK_PRESETS,
  buildEnterpriseNetwork,
  ZONE_LABELS,
} from '../domain/assetNetwork';
import {
  calculateDegreeCentrality,
  calculateRawDegree,
  rankByDegreeCentrality,
} from '../algorithms/degreeCentrality';
import {
  calculateClosenessCentrality,
  rankByClosenessCentrality,
} from '../algorithms/closenessCentrality';
import { analyzeComponents, componentLabels } from '../algorithms/connectedComponents';
import { articulationImpact } from '../algorithms/articulationPoints';
import { reachabilityProfile } from '../algorithms/helpers/traversal';
import { interpret, describeAsset } from '../analysis/interpret';
import FindingsFeed from './FindingsFeed';
import AnalysisResults from './AnalysisResults';
import NetworkVisualizer from './NetworkVisualizer';
import '../styles/network-analyzer.css';

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function buildStats(graph) {
  const vertexCount = graph.getVertexCount();
  const totalDegree = graph
    .getVertices()
    .reduce((sum, v) => sum + graph.getDegree(v), 0);
  return {
    vertexCount,
    edgeCount: graph.getEdgeCount(),
    density: graph.getDensity(),
    avgDegree: vertexCount > 0 ? totalDegree / vertexCount : 0,
  };
}

/** Run every algorithm (timed) and assemble the interpretation context. */
function analyze(graph, assets) {
  const timings = {};

  let t = now();
  const degree = calculateDegreeCentrality(graph);
  timings.degree = now() - t;

  const rawDegree = calculateRawDegree(graph);

  t = now();
  const components = analyzeComponents(graph);
  timings.components = now() - t;

  t = now();
  const articulation = articulationImpact(graph);
  timings.articulation = now() - t;

  t = now();
  const closeness = calculateClosenessCentrality(graph);
  timings.closeness = now() - t;

  const degreeRank = rankByDegreeCentrality(graph);
  const closenessRank = rankByClosenessCentrality(graph);

  // Reachability only for the assets we actually report on (top closeness).
  const reach = {};
  closenessRank.slice(0, 6).forEach(({ vertex }) => {
    reach[vertex] = reachabilityProfile(graph, vertex, 3);
  });

  const ctx = {
    graph,
    assets,
    stats: buildStats(graph),
    components,
    degree,
    rawDegree,
    closeness,
    degreeRank,
    closenessRank,
    articulation,
    reach,
    timings,
  };

  const report = interpret(ctx);
  return { ctx, report, timings };
}

function AssetDetail({ ctx, id, onClose }) {
  const d = useMemo(() => describeAsset(ctx, id), [ctx, id]);
  return (
    <div className="asset-detail">
      <button type="button" className="asset-detail-close" onClick={onClose}>
        ×
      </button>
      <h4>{d.label}</h4>
      <p className="asset-detail-meta">
        {d.typeLabel} · {d.zoneLabel} · {d.criticality} criticality
      </p>
      <ul className="asset-detail-list">
        <li>
          <span>Direct connections</span>
          <strong>{d.degree}</strong>
        </li>
        <li>
          <span>Reachable within 2 hops</span>
          <strong>
            {d.reachWithin2 != null ? `${Math.round(d.reachWithin2 * 100)}%` : '—'}
          </strong>
        </li>
        <li>
          <span>Reachable overall</span>
          <strong>
            {d.reachableFraction != null
              ? `${Math.round(d.reachableFraction * 100)}%`
              : '—'}
          </strong>
        </li>
        <li>
          <span>Single point of failure</span>
          <strong>{d.isChokepoint ? 'Yes' : 'No'}</strong>
        </li>
        {d.isChokepoint && (
          <li>
            <span>Assets isolated if it fails</span>
            <strong>{d.isolatesOnFailure}</strong>
          </li>
        )}
      </ul>
    </div>
  );
}

function NetworkAnalyzer() {
  const [presetKey, setPresetKey] = useState('segmented');
  const [scale, setScale] = useState(24);
  const [network, setNetwork] = useState(() => NETWORK_PRESETS.segmented.build());
  const [analysis, setAnalysis] = useState(null);
  const [tab, setTab] = useState('findings');
  const [colorMode, setColorMode] = useState('risk');
  const [hoverAssets, setHoverAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [error, setError] = useState(null);

  const loadPreset = useCallback((key) => {
    setPresetKey(key);
    setError(null);
    setSelectedAsset(null);
    try {
      setNetwork(NETWORK_PRESETS[key].build());
      setAnalysis(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const regenerateScaled = useCallback(() => {
    setError(null);
    setSelectedAsset(null);
    try {
      setNetwork(
        buildEnterpriseNetwork({
          workstations: Number(scale),
          segmented: presetKey !== 'flat',
          flat: presetKey === 'flat',
          injectAnomaly: presetKey === 'incident',
          seed: Math.floor(Math.random() * 100000),
        })
      );
      setAnalysis(null);
    } catch (e) {
      setError(e.message);
    }
  }, [scale, presetKey]);

  const runAnalysis = useCallback(() => {
    setError(null);
    try {
      setAnalysis(analyze(network.graph, network.assets));
    } catch (e) {
      setError(e.message);
    }
  }, [network]);

  const closenessMap = analysis ? analysis.ctx.closeness : null;
  const riskByVertex = analysis ? analysis.report.riskByVertex : {};
  const chokepoints = analysis
    ? analysis.ctx.articulation.map((a) => a.vertex)
    : [];

  return (
    <div className="network-analyzer">
      <header className="na-header">
        <h1>Network Analysis</h1>
        <p>
          Reads an IT asset &amp; connectivity graph and reports what matters
          operationally: where the network is exposed, which assets are single
          points of failure, and which hosts are behaving abnormally.
        </p>
      </header>

      <div className="na-controls">
        <div className="control-group">
          <label htmlFor="preset">Network</label>
          <select
            id="preset"
            value={presetKey}
            onChange={(e) => loadPreset(e.target.value)}
          >
            {Object.entries(NETWORK_PRESETS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label htmlFor="scale">Workstations</label>
          <input
            id="scale"
            type="number"
            min="4"
            max="200"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-secondary" onClick={regenerateScaled}>
          Regenerate
        </button>
        <button type="button" className="btn btn-primary" onClick={runAnalysis}>
          Run analysis
        </button>
      </div>

      {error && <div className="na-error">Error: {error}</div>}

      {analysis && (
        <div className={`posture-banner rating-${analysis.report.posture.rating.replace(/\s+/g, '-').toLowerCase()}`}>
          <div className="posture-score">
            <span className="posture-score-value">{analysis.report.posture.score}</span>
            <span className="posture-score-label">/ 100</span>
          </div>
          <div className="posture-text">
            <strong>{analysis.report.posture.rating}</strong>
            <span className="posture-headline">{analysis.report.posture.headline}</span>
            <span className="posture-summary">{analysis.report.posture.summary}</span>
          </div>
        </div>
      )}

      <div className="na-body">
        <div className="na-visual">
          <div className="visual-toolbar">
            <label>
              Colour
              <select value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
                <option value="risk">By risk</option>
                <option value="zone">By zone</option>
                <option value="component">By connected group</option>
              </select>
            </label>
            <span className="visual-hint">
              Node size = blast radius · ⬤ ring = single point of failure
            </span>
          </div>
          <NetworkVisualizer
            graph={network.graph}
            assets={network.assets}
            colorMode={colorMode}
            riskByVertex={riskByVertex}
            componentLabels={analysis ? componentLabels(network.graph) : null}
            centrality={colorMode === 'risk' || colorMode === 'zone' ? closenessMap : null}
            closeness={closenessMap}
            chokepoints={chokepoints}
            highlightAssets={hoverAssets}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
          />
          {analysis && selectedAsset && (
            <AssetDetail
              ctx={analysis.ctx}
              id={selectedAsset}
              onClose={() => setSelectedAsset(null)}
            />
          )}
          <ZoneLegend colorMode={colorMode} />
        </div>

        <div className="na-panel">
          <div className="tab-bar">
            <button
              type="button"
              className={tab === 'findings' ? 'tab active' : 'tab'}
              onClick={() => setTab('findings')}
            >
              Findings
              {analysis && analysis.report.findings.length > 0 && (
                <span className="tab-badge">{analysis.report.findings.length}</span>
              )}
            </button>
            <button
              type="button"
              className={tab === 'details' ? 'tab active' : 'tab'}
              onClick={() => setTab('details')}
            >
              Algorithm details
            </button>
          </div>

          {tab === 'findings' ? (
            <FindingsFeed
              report={analysis ? analysis.report : null}
              assets={network.assets}
              onHoverAssets={setHoverAssets}
              onSelectAsset={setSelectedAsset}
            />
          ) : (
            <AnalysisResults analysis={analysis} assets={network.assets} />
          )}
        </div>
      </div>
    </div>
  );
}

function ZoneLegend({ colorMode }) {
  if (colorMode === 'risk') {
    return (
      <div className="legend">
        {[
          ['critical', 'Critical'],
          ['high', 'High'],
          ['medium', 'Medium'],
          ['none', 'No finding'],
        ].map(([k, label]) => (
          <span key={k} className="legend-item">
            <i className={`legend-dot risk-${k}`} /> {label}
          </span>
        ))}
      </div>
    );
  }
  if (colorMode === 'zone') {
    return (
      <div className="legend">
        {Object.entries(ZONE_LABELS).map(([k, label]) => (
          <span key={k} className="legend-item">
            <i className={`legend-dot zone-${k}`} /> {label}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

export default NetworkAnalyzer;
export { analyze, buildStats };
