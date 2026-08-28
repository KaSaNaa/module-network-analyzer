import React, { useState } from 'react';

/**
 * FindingsFeed
 *
 * The default, analyst-facing view: a severity-sorted list of plain-language
 * findings, each with affected assets and a recommended action. The raw
 * graph-theory evidence is tucked behind a "Show evidence" toggle.
 */

const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

function EvidenceBlock({ evidence }) {
  const entries = Object.entries(evidence || {});
  if (entries.length === 0) return null;
  return (
    <dl className="finding-evidence">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{typeof value === 'number' ? value.toFixed(4).replace(/\.?0+$/, '') : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function FindingCard({ finding, assets, onHoverAssets, onSelectAsset }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const affected = finding.assets || [];

  return (
    <article
      className={`finding-card severity-${finding.severity}`}
      onMouseEnter={() => onHoverAssets(affected)}
      onMouseLeave={() => onHoverAssets([])}
    >
      <header className="finding-head">
        <span className={`severity-pill severity-${finding.severity}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <h4>{finding.title}</h4>
      </header>

      <p className="finding-summary">{finding.summary}</p>

      {finding.recommendation && (
        <p className="finding-reco">
          <strong>Recommended:</strong> {finding.recommendation}
        </p>
      )}

      {affected.length > 0 && (
        <div className="finding-assets">
          {affected.slice(0, 12).map((id) => (
            <button
              type="button"
              key={id}
              className="asset-chip"
              onClick={() => onSelectAsset(id)}
            >
              {assets[id] ? assets[id].label : id}
            </button>
          ))}
          {affected.length > 12 && (
            <span className="asset-chip more">+{affected.length - 12}</span>
          )}
        </div>
      )}

      {finding.evidence && Object.keys(finding.evidence).length > 0 && (
        <button
          type="button"
          className="evidence-toggle"
          onClick={() => setShowEvidence((v) => !v)}
        >
          {showEvidence ? 'Hide' : 'Show'} evidence
        </button>
      )}
      {showEvidence && <EvidenceBlock evidence={finding.evidence} />}
    </article>
  );
}

function FindingsFeed({ report, assets, onHoverAssets, onSelectAsset }) {
  if (!report) {
    return (
      <div className="results-empty">
        <p>Choose a network and run the analysis to get findings.</p>
      </div>
    );
  }

  const { findings, posture } = report;
  const { counts } = posture;

  return (
    <div className="findings-feed">
      <div className="findings-summary-bar">
        {['critical', 'high', 'medium', 'low', 'info'].map((sev) =>
          counts[sev] > 0 ? (
            <span key={sev} className={`count-pill severity-${sev}`}>
              {counts[sev]} {SEVERITY_LABEL[sev]}
            </span>
          ) : null
        )}
      </div>

      {findings.length === 0 && (
        <p className="results-empty">No findings — the network looks clean.</p>
      )}

      {findings.map((finding) => (
        <FindingCard
          key={finding.id}
          finding={finding}
          assets={assets}
          onHoverAssets={onHoverAssets}
          onSelectAsset={onSelectAsset}
        />
      ))}
    </div>
  );
}

export default FindingsFeed;
