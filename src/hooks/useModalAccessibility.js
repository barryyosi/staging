import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  );
}

export function useModalAccessibility({
  containerRef,
  onClose,
  initialFocusRef,
}) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const active = document.activeElement;
    previousFocusRef.current = active instanceof HTMLElement ? active : null;

    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }

    const initialTarget =
      initialFocusRef?.current || getFocusable(container)[0] || container;
    requestAnimationFrame(() => {
      if (initialTarget instanceof HTMLElement) {
        initialTarget.focus();
      }
    });

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey) {
        if (current === first || !container.contains(current)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (current === last || !container.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') {
        requestAnimationFrame(() => {
          if (document.contains(previous)) {
            previous.focus();
          }
        });
      }
    };
  }, [containerRef, onClose, initialFocusRef]);
}
