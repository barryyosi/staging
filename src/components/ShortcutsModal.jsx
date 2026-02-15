import { useEffect, memo } from 'react';

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

function ShortcutsModal({ onClose }) {
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-shortcuts">
        <h2>Keyboard Shortcuts</h2>

        <div className="shortcuts-grid">
          <div className="shortcut-category">
            <h3 className="shortcut-category-title">NAVIGATION</h3>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">j</kbd>
              </div>
              <span className="shortcut-desc">Next file</span>
            </div>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">k</kbd>
              </div>
              <span className="shortcut-desc">Previous file</span>
            </div>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">g</kbd>
                <span className="shortcut-then">then</span>
                <kbd className="shortcut-key">g</kbd>
              </div>
              <span className="shortcut-desc">First file</span>
            </div>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">G</kbd>
              </div>
              <span className="shortcut-desc">Last file</span>
            </div>
          </div>

          <div className="shortcut-category">
            <h3 className="shortcut-category-title">ACTIONS</h3>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">x</kbd>
              </div>
              <span className="shortcut-desc">Toggle collapse current file</span>
            </div>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">z</kbd>
              </div>
              <span className="shortcut-desc">Collapse/expand all</span>
            </div>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">?</kbd>
              </div>
              <span className="shortcut-desc">Show this help</span>
            </div>
          </div>

          <div className="shortcut-category">
            <h3 className="shortcut-category-title">COMMIT</h3>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">{modKey}</kbd>
                <span className="shortcut-then">+</span>
                <kbd className="shortcut-key">↵</kbd>
              </div>
              <span className="shortcut-desc">Open commit modal</span>
            </div>
            <div className="shortcut-row">
              <div className="shortcut-keys">
                <kbd className="shortcut-key">Esc</kbd>
              </div>
              <span className="shortcut-desc">Close modal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ShortcutsModal);
