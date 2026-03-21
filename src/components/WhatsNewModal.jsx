import { useRef } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

function formatVersion(version, fallbackLabel = 'latest') {
  return version ? `v${version}` : fallbackLabel;
}

function renderSection(title, items) {
  if (!items?.length) return null;

  return (
    <section className="whats-new-section">
      <h4>{title}</h4>
      <ul className="whats-new-list">
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function WhatsNewModal({ updateStatus, onClose, onUpdate }) {
  const modalRef = useRef(null);
  const updateButtonRef = useRef(null);
  const latestVersion =
    updateStatus?.latestVersion || updateStatus?.changelog?.version || '';
  const currentVersion = updateStatus?.currentVersion || '';
  const changelog = updateStatus?.changelog;
  const isUpdating = updateStatus?.status === 'updating';
  const titleId = 'whats-new-modal-title';

  useModalAccessibility({
    containerRef: modalRef,
    onClose,
    initialFocusRef: updateButtonRef,
  });

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className="modal modal-whats-new"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId}>
          {latestVersion
            ? `What's New in ${formatVersion(latestVersion)}`
            : "What's New"}
        </h3>

        <p className="whats-new-subtitle">
          A newer Staging build is available.
        </p>

        <div className="whats-new-version-row" aria-label="Version details">
          <span className="whats-new-version-pill">
            Current {formatVersion(currentVersion, 'unknown')}
          </span>
          <span className="whats-new-version-arrow" aria-hidden="true">
            →
          </span>
          <span className="whats-new-version-pill">
            Available {formatVersion(latestVersion, 'latest')}
          </span>
        </div>

        {changelog ? (
          <div className="whats-new-sections">
            {renderSection('Features', changelog.features)}
            {renderSection('Fixes', changelog.fixes)}
            {renderSection('Notes', changelog.notes)}
          </div>
        ) : (
          <p className="whats-new-empty">
            Release notes were not found for this update, but a newer version is
            available.
          </p>
        )}

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>
            Later
          </button>
          <button
            ref={updateButtonRef}
            className="btn btn-primary"
            type="button"
            disabled={isUpdating}
            onClick={onUpdate}
          >
            {isUpdating ? 'Updating...' : 'Update now'}
          </button>
        </div>
      </div>
    </div>
  );
}
