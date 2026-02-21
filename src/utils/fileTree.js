/**
 * Builds a nested file tree from flat file paths.
 *
 * @param {Array} fileSummaries - staged file summary objects ({ from, to, status, additions, deletions })
 * @param {string[]|null} allTrackedFiles - optional full list of tracked file paths (for "show all" mode)
 * @param {Array|null} unstagedFiles - optional unstaged file objects ({ from, to, status, additions, deletions })
 * @returns {Array} tree nodes sorted: directories first, then files, alphabetically within each group
 */
export function buildFileTree(
  fileSummaries,
  allTrackedFiles = null,
  unstagedFiles = null,
) {
  const stagedByPath = new Map();
  for (const file of fileSummaries) {
    const filePath = file.to || file.from;
    if (filePath) stagedByPath.set(filePath, file);
  }
  const unstagedByPath = new Map();
  if (unstagedFiles) {
    for (const file of unstagedFiles) {
      const filePath = file.to || file.from;
      if (filePath) unstagedByPath.set(filePath, file);
    }
  }

  // Collect all paths we need to show
  const allPaths = new Set(stagedByPath.keys());
  if (allTrackedFiles) {
    for (const p of allTrackedFiles) allPaths.add(p);
  }
  for (const p of unstagedByPath.keys()) allPaths.add(p);

  // Build a map of dir path -> { children map }
  const root = { children: new Map() };

  for (const filePath of allPaths) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(name)) {
        current.children.set(name, {
          name,
          path: partPath,
          isFile,
          children: isFile ? null : new Map(),
          file: null,
          unstagedFile: null,
          isStaged: false,
          isUnstaged: false,
        });
      }

      const node = current.children.get(name);

      if (isFile) {
        const staged = stagedByPath.get(filePath);
        const unstaged = unstagedByPath.get(filePath);
        node.isStaged = Boolean(staged);
        node.isUnstaged = Boolean(unstaged);
        node.file = staged || null;
        node.unstagedFile = unstaged || null;
      }

      current = node;
    }
  }

  // Convert maps to sorted arrays recursively
  function toSortedArray(nodeMap) {
    if (!nodeMap || nodeMap.size === 0) return [];

    const dirs = [];
    const files = [];

    for (const node of nodeMap.values()) {
      if (node.isFile) {
        files.push({
          name: node.name,
          path: node.path,
          isFile: true,
          file: node.file,
          unstagedFile: node.unstagedFile,
          isStaged: node.isStaged,
          isUnstaged: node.isUnstaged,
        });
      } else {
        dirs.push({
          name: node.name,
          path: node.path,
          isFile: false,
          children: toSortedArray(node.children),
          isStaged: false,
        });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files];
  }

  return toSortedArray(root.children);
}

import { fuzzyMatchPath } from './fuzzySearch';

/**
 * Filters a tree to only include nodes matching a search query.
 * Returns a new tree with matching files and their ancestor directories.
 */
export function filterTree(tree, query) {
  if (!query) return tree;

  function filterNodes(nodes) {
    const result = [];
    for (const node of nodes) {
      if (node.isFile) {
        const matchResult = fuzzyMatchPath(node.path, query);
        if (matchResult) {
          result.push({ ...node, fuzzyResult: matchResult });
        }
      } else {
        const filteredChildren = filterNodes(node.children);
        if (filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren });
        }
      }
    }
    return result;
  }

  return filterNodes(tree);
}
