import { useState, useCallback, useEffect } from 'react';

// Open/close state for a non-modal popover anchored to a trigger button:
// closes on outside pointerdown and on Escape, and returns focus to the
// trigger when it closes. Deliberately not useModalAccessibility — that
// focus-traps, which fights textareas inside these popovers.
export function useDismissablePopover({ wrapRef, triggerRef }) {
  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(
    (restoreFocus = true) => {
      setIsOpen(false);
      if (restoreFocus) {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [triggerRef],
  );

  const open = useCallback(() => setIsOpen(true), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        close(true);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        close(true);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, isOpen, wrapRef]);

  return { isOpen, open, close, toggle };
}
