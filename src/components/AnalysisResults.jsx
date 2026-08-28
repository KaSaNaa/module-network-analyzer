import React from 'react';

/**
 * AnalysisResults — the "Algorithm details" tab.
 *
 * The raw graph-theory output kept for transparency and for the DSA course
 * report: network statistics, component breakdown, centrality rankings,
 * articulation points, and measured execution time / complexity per algorithm.
 */

const fmt = (v, d = 4) =>
  v === undefined || v === null ? '—' : Number(v).toFixed(d);
const ms = (v) => (v === undefined || v === null ? '—' : `${Number(v).toFixed(3)} ms`);

function nameOf(assets, id) {
  return assets && assets[id] ? assets[id].label : id;
}

function RankTable({ title, complexity, rows, assets }) {
  return (
    <div className="rank-table">
      <h4>
        {title} <span className="complexity-tag">{complexity}</span>
      </h4>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Asset</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, i) => (
            <tr key={row.vertex}>
              <td>{i + 1}</td>
              <td>{nameOf(assets, row.vertex)}</td>
              <td>{fmt(row.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisResults({ analysis, assets }) {
  if (!analysis) {
    return (
      <div className="results-empty">
        <p>Run the analysis to see the underlying algorithm output.</p>
      </div>
    );
  }

  const { ctx, timings } = analysis;
  const { stats, components, degreeRank, closenessRank, articulation } = ctx;

  return (
    <div className="analysis-results">
      <section className="results-section">
        <h3>Network Statistics</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.vertexCount}</span>
            <span className="stat-label">Assets (V)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.edgeCount}</span>
            <span className="stat-label">Connections (E)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{fmt(stats.density, 3)}</span>
            <span className="stat-label">Density</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{fmt(stats.avgDegree, 2)}</span>
            <span className="stat-label">Avg degree</span>
          </div>
        </div>
      </section>

      <section className="results-section">
        <h3>Connected Components (DFS)</h3>
        <p>
          {components.count === 1
            ? 'All assets are in a single connected group.'
            : `The network has ${components.count} separate groups.`}
        </p>
        <div className="component-list">
          {components.sizes.map((size, i) => (
            <span key={i} className={`component-chip component-color-${i % 8}`}>
              Group {i + 1}: {size} asset{size === 1 ? '' : 's'}
            </span>
          ))}
        </div>
      </section>

      <section className="results-section">
        <h3>
          Articulation Points (Tarjan) <span className="complexity-tag">O(V + E)</span>
        </h3>
        {articulation.length === 0 ? (
          <p>No single asset failure splits the network.</p>
        ) : (
          <table className="timing-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Islands created</th>
                <th>Assets isolated</th>
              </tr>
            </thead>
            <tbody>
              {articulation.map((a) => (
                <tr key={a.vertex}>
                  <td>{nameOf(assets, a.vertex)}</td>
                  <td>{a.resultingComponents}</td>
                  <td>{a.isolatedAssets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="results-section">
        <h3>Centrality Rankings</h3>
        <div className="rank-tables">
          <RankTable
            title="Degree centrality"
            complexity="O(V)"
            rows={degreeRank}
            assets={assets}
          />
          <RankTable
            title="Closeness centrality"
            complexity="O(V² + VE)"
            rows={closenessRank}
            assets={assets}
          />
        </div>
      </section>

      <section className="results-section">
        <h3>Execution Time</h3>
        <table className="timing-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Complexity</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Degree centrality</td>
              <td>O(V)</td>
              <td>{ms(timings.degree)}</td>
            </tr>
            <tr>
              <td>Connected components</td>
              <td>O(V + E)</td>
              <td>{ms(timings.components)}</td>
            </tr>
            <tr>
              <td>Articulation points</td>
              <td>O(V + E) + impact O(P·(V+E))</td>
              <td>{ms(timings.articulation)}</td>
            </tr>
            <tr>
              <td>Closeness centrality</td>
              <td>O(V² + VE)</td>
              <td>{ms(timings.closeness)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default AnalysisResults;
