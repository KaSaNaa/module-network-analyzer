import React, { useMemo } from 'react';
import { assetMeta } from '../domain/assetNetwork';

/**
 * NetworkVisualizer
 *
 * SVG rendering of the asset graph. Node positions come from a small
 * deterministic force-directed layout (no external library).
 *
 *   colour  -> risk severity | zone | connected group
 *   size    -> blast radius (closeness centrality)
 *   ring    -> single point of failure (articulation point)
 */

const WIDTH = 680;
const HEIGHT = 500;

const RISK_COLORS = {
  critical: '#c0392b',
  high: '#e67e22',
  medium: '#f1c40f',
  low: '#95a5a6',
  none: '#5aa469',
};

const ZONE_COLORS = {
  core: '#3498db',
  user: '#9b59b6',
  dmz: '#e67e22',
  perimeter: '#e74c3c',
  mgmt: '#1abc9c',
  infra: '#34495e',
  ot: '#d35400',
  unknown: '#95a5a6',
};

const COMPONENT_COLORS = [
  '#3498db', '#e74c3c', '#27ae60', '#9b59b6',
  '#f39c12', '#1abc9c', '#e67e22', '#2c3e50',
];

function computeLayout(vertices, edges, { width = WIDTH, height = HEIGHT, iterations = 260 } = {}) {
  const n = vertices.length;
  if (n === 0) return {};

  const k = Math.sqrt((width * height) / n) * 0.72;
  const pos = {};
  vertices.forEach((v, i) => {
    const angle = (2 * Math.PI * i) / n;
    pos[v] = {
      x: width / 2 + Math.cos(angle) * (width / 3),
      y: height / 2 + Math.sin(angle) * (height / 3),
    };
  });

  let temp = width / 10;
  const cool = temp / (iterations + 1);

  for (let iter = 0; iter < iterations; iter++) {
    const disp = {};
    vertices.forEach((v) => {
      disp[v] = { x: 0, y: 0 };
    });

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = vertices[i];
        const b = vertices[j];
        let dx = pos[a].x - pos[b].x;
        let dy = pos[a].y - pos[b].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        disp[a].x += (dx / dist) * force;
        disp[a].y += (dy / dist) * force;
        disp[b].x -= (dx / dist) * force;
        disp[b].y -= (dy / dist) * force;
      }
    }

    edges.forEach(({ from, to }) => {
      if (!pos[from] || !pos[to]) return;
      let dx = pos[from].x - pos[to].x;
      let dy = pos[from].y - pos[to].y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      disp[from].x -= (dx / dist) * force;
      disp[from].y -= (dy / dist) * force;
      disp[to].x += (dx / dist) * force;
      disp[to].y += (dy / dist) * force;
    });

    vertices.forEach((v) => {
      const d = disp[v];
      const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      pos[v].x += (d.x / len) * Math.min(len, temp);
      pos[v].y += (d.y / len) * Math.min(len, temp);
      pos[v].x = Math.max(28, Math.min(width - 28, pos[v].x));
      pos[v].y = Math.max(28, Math.min(height - 28, pos[v].y));
    });

    temp -= cool;
  }

  return pos;
}

function NetworkVisualizer({
  graph,
  assets = {},
  colorMode = 'risk',
  riskByVertex = {},
  componentLabels = {},
  closeness = null,
  chokepoints = [],
  highlightAssets = [],
  selectedAsset = null,
  onSelectAsset,
}) {
  const { vertices, edges } = useMemo(() => {
    if (!graph) return { vertices: [], edges: [] };
    return { vertices: graph.getVertices(), edges: graph.getEdges() };
  }, [graph]);

  const layout = useMemo(() => computeLayout(vertices, edges), [vertices, edges]);

  const maxCloseness = useMemo(() => {
    if (!closeness) return 0;
    return Math.max(0, ...Object.values(closeness));
  }, [closeness]);

  const chokeSet = useMemo(() => new Set(chokepoints), [chokepoints]);
  const highlightSet = useMemo(() => new Set(highlightAssets), [highlightAssets]);

  if (!graph || vertices.length === 0) {
    return (
      <div className="visualizer-empty">
        <p>No network to display.</p>
      </div>
    );
  }

  const radiusFor = (vertex) => {
    if (!closeness || maxCloseness === 0) return 9;
    return 7 + ((closeness[vertex] || 0) / maxCloseness) * 13;
  };

  const colorFor = (vertex) => {
    if (colorMode === 'zone') {
      const meta = assets[vertex] ? assets[vertex] : assetMeta('unknown');
      return ZONE_COLORS[meta.zone] || ZONE_COLORS.unknown;
    }
    if (colorMode === 'component') {
      const idx = componentLabels[vertex] ?? 0;
      return COMPONENT_COLORS[idx % COMPONENT_COLORS.length];
    }
    return RISK_COLORS[riskByVertex[vertex] || 'none'] || RISK_COLORS.none;
  };

  const hasHighlight = highlightSet.size > 0;

  return (
    <div className="visualizer">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="visualizer-svg"
        role="img"
        aria-label="Network graph"
      >
        <g className="edges">
          {edges.map(({ from, to }, i) => {
            const a = layout[from];
            const b = layout[to];
            if (!a || !b) return null;
            const dim = hasHighlight && !highlightSet.has(from) && !highlightSet.has(to);
            return (
              <line
                key={`e-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="edge-line"
                opacity={dim ? 0.15 : 0.6}
              />
            );
          })}
        </g>
        <g className="nodes">
          {vertices.map((vertex) => {
            const p = layout[vertex];
            if (!p) return null;
            const r = radiusFor(vertex);
            const isChoke = chokeSet.has(vertex);
            const isSelected = selectedAsset === vertex;
            const isHi = highlightSet.has(vertex);
            const dim = hasHighlight && !isHi;
            const label = assets[vertex] ? assets[vertex].label : vertex;
            return (
              <g
                key={`n-${vertex}`}
                transform={`translate(${p.x}, ${p.y})`}
                className="node"
                opacity={dim ? 0.25 : 1}
                onClick={() => onSelectAsset && onSelectAsset(vertex)}
                style={{ cursor: onSelectAsset ? 'pointer' : 'default' }}
              >
                {isChoke && (
                  <circle r={r + 5} className="choke-ring" fill="none" />
                )}
                <circle
                  r={r}
                  fill={colorFor(vertex)}
                  stroke={isSelected ? '#111' : '#fff'}
                  strokeWidth={isSelected ? 3 : 1.5}
                  className="node-circle"
                />
                {(vertices.length <= 60 || isHi || isSelected || isChoke) && (
                  <text className="node-label" y={-r - 4}>
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export default NetworkVisualizer;
export { computeLayout, RISK_COLORS, ZONE_COLORS };
