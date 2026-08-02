// Copies text to the clipboard and reports whether it actually landed, so
// callers can avoid telling the user "copied" when nothing was.
//
// Takes a promise rather than a string because Safari drops the user
// activation that authorises a clipboard write across an await. When the text
// still has to be computed (re-resolving comment lines hits the network), the
// write has to be *initiated* synchronously inside the click handler and given
// a promise to settle later — ClipboardItem accepts one, writeText does not.
export function copyToClipboard(textPromise) {
  const text = Promise.resolve(textPromise);

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      return navigator.clipboard
        .write([
          new ClipboardItem({
            'text/plain': text.then(
              (value) => new Blob([value], { type: 'text/plain' }),
            ),
          }),
        ])
        .then(
          () => true,
          () => fallbackWrite(text),
        );
    }
  } catch {
    // ClipboardItem construction can throw on older engines
  }

  return fallbackWrite(text);
}

function fallbackWrite(text) {
  return text.then(
    (value) => {
      if (!navigator.clipboard?.writeText) return false;
      return navigator.clipboard.writeText(value).then(
        () => true,
        () => false,
      );
    },
    () => false,
  );
}
