import { useState, useRef } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

export default function CommitModal({
  actionType,
  onCommit,
  onClose,
  onGenerateViaAgent,
  canGenerateViaAgent,
}) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  const modalRef = useRef(null);

  useModalAccessibility({
    containerRef: modalRef,
    onClose,
    initialFocusRef: textareaRef,
  });

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onCommit(message);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const title =
    actionType === 'commit-and-push'
      ? 'Commit & Push Changes'
      : 'Commit Staged Changes';
  const btnLabel =
    actionType === 'commit-and-push' ? 'Commit & Push' : 'Commit';
  const titleId = 'commit-modal-title';

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId}>{title}</h3>
        <textarea
          ref={textareaRef}
          aria-label="Commit message"
          placeholder="Enter commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          {onGenerateViaAgent && (
            <button
              className="btn btn-generate-via-agent"
              type="button"
              disabled={!canGenerateViaAgent}
              title={
                canGenerateViaAgent
                  ? 'Send a prompt to your agent to generate a commit message'
                  : 'No send mediums selected'
              }
              onClick={onGenerateViaAgent}
            >
              Generate via Agent
            </button>
          )}
          <button
            className="btn btn-commit"
            type="button"
            onClick={() => onCommit(message)}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
