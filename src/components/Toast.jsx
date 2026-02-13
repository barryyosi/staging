import { memo } from 'react';

function Toast({ toast }) {
  if (!toast) {
    return <div id="toast" className="hidden" />;
  }

  return (
    <div id="toast" className={toast.type}>
      {toast.message}
    </div>
  );
}

export default memo(Toast);
