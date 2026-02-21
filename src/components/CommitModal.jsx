import { useState, useRef, useEffect } from 'react';

export default function CommitModal({ actionType, onCommit, onClose }) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onCommit(message);
    }
    if (e.key === 'Escape') {
      onClose();
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

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal">
        <h3>{title}</h3>
        <textarea
          ref={textareaRef}
          placeholder="Enter commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-commit" onClick={() => onCommit(message)}>
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
