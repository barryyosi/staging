import { useRef } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

function formatVersion(version, fallbackLabel) {
  return version ? `v${version}` : fallbackLabel;
}

function VersionPill({ label, version, commit, fallbackLabel }) {
  return (
    <span className="whats-new-version-pill">
      {label} {formatVersion(version, fallbackLabel)}
      {commit && (
        <span className="whats-new-version-commit">{commit.slice(0, 7)}</span>
      )}
    </span>
  );
}

function entryHeading(entry) {
  const name = entry.version ? `v${entry.version}` : entry.title;
  return entry.date ? `${name} · ${entry.date}` : name;
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

function renderEntries(entries, latestVersion) {
  return entries.map((entry, index) => {
    // The modal title already names the version being installed; repeat a
    // heading only when the entry is something else (older, or unreleased).
    const showHeading =
      entries.length > 1 || !entry.version || entry.version !== latestVersion;
    return (
      <div className="whats-new-entry" key={`${entry.title}-${index}`}>
        {showHeading && (
          <h4 className="whats-new-entry-title">{entryHeading(entry)}</h4>
        )}
        {renderSection('Features', entry.features)}
        {renderSection('Fixes', entry.fixes)}
        {renderSection('Notes', entry.notes)}
      </div>
    );
  });
}

function renderCommits(commits) {
  return (
    <section className="whats-new-section">
      <h4>Commits</h4>
      <ul className="whats-new-list">
        {commits.map((commit) => (
          <li key={commit.sha}>
            <span className="whats-new-commit-sha">{commit.sha}</span>
            {commit.subject}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function WhatsNewModal({ updateStatus, onClose, onUpdate }) {
  const modalRef = useRef(null);
  const updateButtonRef = useRef(null);
  const currentVersion = updateStatus?.currentVersion || '';
  const latestVersion = updateStatus?.latestVersion || '';
  const entries = updateStatus?.changelogEntries || [];
  const commits = updateStatus?.commits || [];
  const commitsBehind = updateStatus?.commitsBehind || 0;
  const sameVersion =
    Boolean(currentVersion) && currentVersion === latestVersion;
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

  let body;
  if (entries.length > 0) {
    body = (
      <div className="whats-new-sections">
        {renderEntries(entries, latestVersion)}
      </div>
    );
  } else if (commits.length > 0) {
    body = <div className="whats-new-sections">{renderCommits(commits)}</div>;
  } else {
    body = (
      <p className="whats-new-empty">
        Release notes were not found for this update, but a newer build is
        available.
      </p>
    );
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
          {latestVersion && !sameVersion
            ? `What's New in ${formatVersion(latestVersion)}`
            : "What's New"}
        </h3>

        <p className="whats-new-subtitle">
          {sameVersion
            ? `A newer build of v${currentVersion} is available. Its version number has not changed.`
            : 'A newer Staging build is available.'}
        </p>

        <div className="whats-new-version-row" aria-label="Version details">
          <VersionPill
            label="Current"
            version={currentVersion}
            commit={updateStatus?.currentCommit}
            fallbackLabel="unknown"
          />
          <span className="whats-new-version-arrow" aria-hidden="true">
            →
          </span>
          <VersionPill
            label="Available"
            version={latestVersion}
            commit={updateStatus?.latestCommit}
            fallbackLabel="latest"
          />
          {commitsBehind > 0 && (
            <span className="whats-new-version-meta">
              {commitsBehind} new {commitsBehind === 1 ? 'commit' : 'commits'}{' '}
              on origin/main
            </span>
          )}
        </div>

        {body}

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
