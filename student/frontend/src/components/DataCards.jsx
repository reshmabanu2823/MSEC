import React from 'react';
import './components.css';

const isEmptyValue = (v) => v === null || v === undefined || v === '' || v === false;

// Meta labels rendered as body text (no label) and as the card's action row.
const BODY_LABELS = new Set(['Details', 'About', 'Description', 'Remarks', 'Summary']);
const ACTION_LABELS = new Set(['Action', 'Actions']);

// "CS604: Terraform Multi-Tier" -> kicker "CS604", title "Terraform Multi-Tier".
function splitTitle(node) {
  if (typeof node !== 'string') return { kicker: null, text: node };
  const m = /^([A-Z]{2,}[0-9][0-9A-Z]*)\s*[:·-]\s+(.+)$/.exec(node);
  return m ? { kicker: m[1], text: m[2] } : { kicker: null, text: node };
}

export default function DataCards({
  rows,
  title,
  value,
  meta,
  keyOf = (_row, index) => index,
  empty = 'Nothing here yet',
  onRowClick,
}) {
  if (!rows || rows.length === 0) {
    return <div className="empty-state">{empty}</div>;
  }

  const interactive = typeof onRowClick === 'function';

  const handleKeyDown = (row) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <div className="data-cards">
      {rows.map((row, index) => {
        const items = (meta || [])
          .map((m) => ({ label: m.label, node: m.render(row) }))
          .filter((m) => !isEmptyValue(m.node));
        const body = items.filter((m) => BODY_LABELS.has(m.label));
        const actions = items.filter((m) => ACTION_LABELS.has(m.label));
        const facts = items.filter((m) => !BODY_LABELS.has(m.label) && !ACTION_LABELS.has(m.label));
        const { kicker, text } = splitTitle(title(row));

        const interactiveProps = interactive
          ? { role: 'button', tabIndex: 0, onClick: () => onRowClick(row), onKeyDown: handleKeyDown(row) }
          : {};

        return (
          <article
            key={keyOf(row, index)}
            className={`card data-card${interactive ? ' data-card--button' : ''}`}
            {...interactiveProps}
          >
            <header className="data-card-head">
              <div className="data-card-heading">
                {kicker && <span className="data-card-kicker" aria-hidden="true">{kicker}</span>}
                <div className="data-card-title">{kicker && <span className="visually-hidden">{kicker}: </span>}{text}</div>
              </div>
              {value && <div className="data-card-value">{value(row)}</div>}
            </header>
            {body.map((m) => (
              <div key={m.label} className="data-card-body">{m.node}</div>
            ))}
            {facts.length > 0 && (
              <dl className="data-card-meta">
                {facts.map((m) => (
                  <div key={m.label}>
                    <dt>{m.label}</dt>
                    <dd>{m.node}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actions.map((m) => (
              <div key={m.label} className="data-card-actions">{m.node}</div>
            ))}
          </article>
        );
      })}
    </div>
  );
}
