import { useState, useEffect, useRef, useMemo, memo } from 'react';

function ProgressRing({ reviewed, total }) {
  const size = 20;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = total > 0 ? reviewed / total : 0;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <svg className="progress-ring-svg" width={size} height={size}>
      <circle
        className="progress-ring-fill"
        stroke="var(--accent)"
        fill="transparent"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function StatsPopover({ additions, deletions, onClose }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={popoverRef} className="stats-popover">
      {additions > 0 && <span className="add">+{additions}</span>}
      {additions > 0 && deletions > 0 && <span className="stats-sep">/</span>}
      {deletions > 0 && <span className="del">-{deletions}</span>}
      {additions === 0 && deletions === 0 && <span>No changes</span>}
    </div>
  );
}

function ProgressRingWithStats({ files, reviewedFiles }) {
  const [showStats, setShowStats] = useState(false);

  const stats = useMemo(() => {
    return {
      total: files?.length || 0,
      reviewed: reviewedFiles?.size || 0,
      additions: files?.reduce((s, f) => s + (f.additions || 0), 0) || 0,
      deletions: files?.reduce((s, f) => s + (f.deletions || 0), 0) || 0,
    };
  }, [files, reviewedFiles]);

  const handleClick = () => {
    setShowStats((prev) => !prev);
  };

  const handleCloseStats = () => {
    setShowStats(false);
  };

  return (
    <div className="progress-ring-wrap">
      <button
        className="progress-ring-btn"
        onClick={handleClick}
        aria-label={`${stats.reviewed} of ${stats.total} files reviewed`}
        title="Click to view line stats"
        type="button"
      >
        <ProgressRing reviewed={stats.reviewed} total={stats.total} />
        <span className="progress-ring-label">
          {stats.reviewed}/{stats.total}
        </span>
      </button>
      {showStats && (
        <StatsPopover
          additions={stats.additions}
          deletions={stats.deletions}
          onClose={handleCloseStats}
        />
      )}
    </div>
  );
}

export default memo(ProgressRingWithStats);
