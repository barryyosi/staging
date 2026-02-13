import { useMemo, memo } from 'react';

function Header({ theme, onToggleTheme, files, hasComments, onSendComments, onCommit, committed }) {
  const summary = useMemo(() => {
    if (!files) return '';
    const totalAdd = files.reduce((s, f) => s + f.additions, 0);
    const totalDel = files.reduce((s, f) => s + f.deletions, 0);
    return `${files.length} file${files.length === 1 ? '' : 's'} changed, +${totalAdd} -${totalDel}`;
  }, [files]);

  return (
    <header id="header">
      <div className="header-left">
        <h1 className="logo">staging</h1>
        <span className="separator" />
        <span id="summary">{summary}</span>
      </div>
      <div className="header-right">
        <button 
          className="theme-toggle" 
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          <span className="material-symbols-rounded theme-toggle-icon">
            {theme === 'dark' ? 'dark_mode' : 'light_mode'}
          </span>
        </button>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            disabled={!hasComments || committed}
            onClick={onSendComments}
          >
            Send to Agent
          </button>
          <button
            className="btn btn-primary"
            disabled={committed}
            onClick={onCommit}
          >
            Approve &amp; Commit
          </button>
        </div>
      </div>
    </header>
  );
}

export default memo(Header);
