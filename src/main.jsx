import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root';
import './style.css';

// Auto-hide scrollbars — show only while scrolling
(() => {
  const timers = new WeakMap();
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      el.classList.add('is-scrolling');
      clearTimeout(timers.get(el));
      timers.set(
        el,
        setTimeout(() => el.classList.remove('is-scrolling'), 800),
      );
    },
    true,
  );
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
