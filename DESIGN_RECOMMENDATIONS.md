# Frontend Design Recommendations

A design audit of the **staging** UI with actionable improvement suggestions. Each section covers what works today and what could be elevated.

---

## 1. Empty & Zero States

**Current:** Plain text strings like `"No staged changes found."` and `"Loading staged changes..."` rendered inside a generic `#loading` div.

**Recommendation:** Design intentional empty states with illustration or iconography, a brief explanation, and a call-to-action. These moments are the first (or only) thing a user sees on launch if they haven't staged anything.

- Add a centered empty-state card with a large muted icon (e.g. `check_circle` or a custom SVG) and a two-line message: headline + subtext with a hint like *"Run `git add` to stage files, then come back."*
- For loading, use skeleton placeholders (pulsing rectangles mimicking file list items and diff cards) instead of a text spinner. CSS `@keyframes shimmer` on a gradient background is lightweight and communicates activity.
- For the error state, use a distinct treatment with a red/amber accent, an icon, and a "Retry" button instead of just prefixing `"Error: "`.
---

## 4. Commit Modal Redesign

**Current:** A minimal modal with a bare `<textarea>` and two buttons. Functional but underwhelming for what is the most consequential action in the app.

**Recommendation:**

- **Character count / line guide:** Show a live character count below the textarea. Highlight when the first line exceeds 72 characters (standard git convention). Use `var(--del-text)` color as a warning.
- **File summary inside the modal:** Show a compact list of staged files (file count + total additions/deletions) above the textarea so the user has context without needing to look behind the overlay.
- **Visual weight:** The "Commit" button currently uses `.btn-commit` (which has no specific styles defined in `style.css` -- it falls back to `.btn` defaults). Give it the `.btn-primary` treatment. Add a subtle pulsing glow or shadow on hover to make it feel like a high-stakes action.

---

## 5. Comment System Enhancements

**Current:** Comment bubbles are clean but flat. They show file:line location and content with Edit/Delete actions.

**Recommendation:**
- **Timestamps:** Add `createdAt` to the comment data model and display a relative time (e.g. "2m ago") in the bubble header. This helps during long review sessions.
- **Threaded replies:** Support a `parentId` field and render child comments indented under the parent. Even one level of nesting dramatically improves multi-topic discussions.
- **Resolved state:** Add a "Resolve" action that visually grays out a comment (reduced opacity, strikethrough, or a checkmark overlay) without deleting it. Resolved comments can be filtered out of the comment panel count.
- **Drag-to-select line range:** Instead of commenting on a single line, let users click-drag across line numbers to attach a comment to a range (e.g. lines 42-47). Display the range in the comment bubble header.
- **Markdown preview:** Support basic Markdown in comments (bold, italic, inline code, code blocks). Render a live preview below the textarea or toggle between "Write" and "Preview" tabs.

---

## 7. Header & Navigation Refinements

**Current:** Glassmorphic sticky header with project navigator, summary pill, collapse toggle, theme toggle, and action buttons.

**Recommendation:**
- **Progress ring:** Replace the plain text summary pill (`"3 files changed, +42 -18"`) with a small visual element -- a tiny ring or progress bar that fills based on "files reviewed" (scrolled past / collapsed). This gamifies the review flow and gives a sense of completion.
- **Keyboard shortcut hints:** Add a small `?` icon button in the header that opens a shortcuts overlay. Map common actions: `j/k` for next/prev file, `c` to open comment on focused line, `Cmd+Enter` to commit, `x` to collapse current file, `z` to toggle collapse all.
- **Breadcrumb truncation:** Long project names in the navigator can overflow. Add `text-overflow: ellipsis` with a `max-width` on `.nav-segment-label`, and show the full path in a tooltip.

---

## 8. Toast & Notification System

**Current:** A single toast at the bottom center that fades in/out. Success, error, and info variants.

**Recommendation:**
- **Stacking:** Support multiple simultaneous toasts stacked vertically. If a hunk unstage succeeds and then another action fires before the first toast fades, they should stack, not replace each other.
- **Slide-up entrance:** Instead of just fading in, slide the toast up from below the viewport (`translateY(100%) -> translateY(0)`) for a more physical feel.
- **Undo action on destructive toasts:** For "Hunk discarded" or "File unstaged" toasts, include an "Undo" button directly in the toast that re-stages the hunk/file within a 5-second window. This is far more forgiving than a `confirm()` dialog.
- **Auto-dismiss progress:** Show a thin shrinking progress bar at the bottom of the toast indicating time remaining before auto-dismiss. Hovering pauses the timer.

---

## 9. Keyboard Navigation & Accessibility

**Current:** Focus rings on interactive elements, `aria-label` on icon buttons, `role="separator"` on resizers. Good foundation.

**Recommendation:**
- **File navigation with `j`/`k`:** Pressing `j` scrolls to the next diff file card, `k` scrolls to the previous. The currently focused file gets a subtle border accent.
- **Vim-like line navigation:** Within a focused diff card, `n` and `p` (or arrow keys) move between changed lines. Pressing `c` on a focused line opens the comment form.
- **Escape cascading:** Define a clear Escape priority: close comment form > close modal > close dropdown > deselect file. Currently Escape only handles individual form/modal contexts.
- **Skip-to-content link:** Add a visually hidden "Skip to diff content" link at the top of the page for screen reader users to bypass the header and sidebar.
- **Announce toast messages:** Toasts should use `role="status"` and `aria-live="polite"` so screen readers announce them.

---

## 10. Visual & Aesthetic Polish

**Current:** Monochrome accent palette, JetBrains Mono everywhere, pill-shaped buttons, subtle borders. Clean but utilitarian.

- **Comment highlight pulse:** When a user clicks a comment in the panel and it scrolls to the inline comment, pulse the comment bubble background once (a brief amber glow) to help the user locate it.

- **Custom selection color:** Set `::selection` to use the accent color for text selection, reinforcing the brand feel even in small interactions.

---

## 11. Responsive Design

**Current:** Fixed grid layout assumes desktop viewport. The only responsive CSS is a single `@media (max-width: 900px)` rule for comment bubble head wrapping.

**Recommendation:**
- **Collapsible sidebar on narrow viewports:** Below ~768px, collapse the sidebar behind a hamburger/drawer toggle. The diff area should take full width.
- **Touch-friendly targets:** Increase hit targets for the comment button (currently 18x18px) to at least 36x36px on touch devices.
- **Responsive font scaling:** The 12px diff font is hard to read on small screens. Use `clamp(12px, 1.2vw, 14px)` for diff content to scale gracefully.
- **Stack header actions:** On narrow viewports, move the action buttons ("Send to Agent", "Commit") into an overflow menu or a bottom action bar.

---

## 12. Performance Perception

**Current:** Pagination with `IntersectionObserver` for lazy-loading diff pages. Syntax highlighting via highlight.js per line.

**Recommendation:**
- **Virtualized diff rendering:** For files with 1000+ lines, render only the visible rows using a lightweight virtual scroller. The current approach renders all lines of a loaded file into the DOM, which can cause frame drops on very large diffs.
- **Highlight.js worker offload:** Move syntax highlighting to a Web Worker to avoid blocking the main thread during initial page render. Return highlighted HTML via `postMessage` and swap it in.
- **Optimistic hunk actions:** When the user clicks "Unstage hunk," immediately remove the hunk from the UI (optimistic update) and show an undo toast. If the API call fails, restore the hunk. This feels instant instead of waiting for `reloadDiffs()`.
- **Content-visibility on collapsed cards:** Add `content-visibility: auto` to `.diff-file-body` when collapsed, so the browser can skip layout and paint for offscreen content.

---

## 13. Commit Flow & Post-Commit Experience

**Current:** After committing, a green banner says "Committed successfully!" and buttons get disabled. The user is left looking at a frozen UI.

**Recommendation:**
- **Post-commit summary card:** Replace the simple banner with a rich card showing: commit hash (short), commit message, file count, total additions/deletions, and a "Copy SHA" button.
- **"Stage more" prompt:** After a successful commit, show a prompt: *"Your changes have been committed. Stage more files to continue reviewing."* with a subtle visual that communicates the cycle is complete.
- **Auto-close or redirect option:** Offer a config option to auto-close the browser tab after a successful commit (since the CLI tool spawns it). Show a 5-second countdown: "Closing in 5s..." with a "Keep open" button.

---

## 14. Theme System Enhancements

**Current:** Binary light/dark toggle. Well-implemented with CSS custom properties and localStorage persistence.

**Recommendation:**
- **System-follow mode:** Add a third option (light / dark / system) that tracks `prefers-color-scheme` in real time via `matchMedia`. Currently system preference is only checked on first load with no saved preference.
- **Smooth theme transition:** Wrap the theme switch in a CSS `transition` on `background-color` and `color` for `body` and key surfaces (200ms). Currently the switch is instant, which feels jarring.
- **Syntax theme alignment:** Verify that the highlight.js color tokens provide sufficient contrast in both themes. The dark theme's `--hljs-string: #a5d6ff` on `--add-bg` (green tint) may have low contrast in certain combinations.

---

## 15. Search & Filtering

**Current:** File sidebar search filters by case-insensitive path substring. Works in both flat and tree views.

**Recommendation:**

- **Change-type filters:** Add filter chips below the search bar: "Added", "Modified", "Deleted", "Renamed". These toggle visibility 

---

## Summary: Priority Ranking

| Priority | Recommendation | Impact | Effort |
|----------|---------------|--------|--------|
| 1 | Word-level diff highlighting | High | Medium |
| 2 | Active file indicator in sidebar | High | Low |
| 3 | Empty states & skeleton loading | Medium | Low |
| 4 | Staggered card entrance animations | Medium | Low |
| 5 | Commit modal redesign | Medium | Medium |
| 6 | Keyboard shortcuts (j/k navigation) | High | Medium |
| 7 | Toast undo action for destructive ops | High | Medium |
| 8 | Side-by-side diff mode | High | High |
| 9 | Comment timestamps + resolved state | Medium | Medium |
| 10 | Responsive / mobile layout | Medium | High |
| 11 | Fuzzy file search | Medium | Low |
| 12 | Virtualized diff rendering | Medium | High |
| 13 | Command palette (Cmd+K) | Medium | Medium |
| 14 | Post-commit summary card | Low | Low |
| 15 | Line-range comment selection | Medium | High |
