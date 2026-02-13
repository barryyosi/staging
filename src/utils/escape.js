export function slugify(filePath) {
  if (!filePath) return 'unknown';
  return filePath.replace(/[^a-zA-Z0-9]/g, '-');
}
