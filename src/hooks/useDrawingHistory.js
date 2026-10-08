import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY = 80;

/**
 * Manages undo/redo for an array of drawing paths.
 *
 * - pushPaths(p)   → record new snapshot, returns p
 * - undo()         → step back, returns previous paths or null
 * - redo()         → step forward, returns next paths or null
 * - resetHistory() → clear stacks (on drawing switch)
 */
export default function useDrawingHistory(initialPaths = []) {
  const [paths, setPaths] = useState(initialPaths);

  const undoStack = useRef([]);
  const redoStack = useRef([]);

  // Force re-render when stack lengths change (for canUndo/canRedo)
  const [, forceUpdate] = useState(0);
  const tick = () => forceUpdate(n => n + 1);

  const pushPaths = useCallback((newPaths) => {
    setPaths(prev => {
      undoStack.current.push(prev);
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift();
      }
      redoStack.current = [];
      tick();
      return newPaths;
    });
    return newPaths;
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return null;
    const previous = undoStack.current.pop();
    setPaths(current => {
      redoStack.current.push(current);
      tick();
      return previous;
    });
    return previous;
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return null;
    const next = redoStack.current.pop();
    setPaths(current => {
      undoStack.current.push(current);
      tick();
      return next;
    });
    return next;
  }, []);

  const resetHistory = useCallback((initial = []) => {
    setPaths(initial);
    undoStack.current = [];
    redoStack.current = [];
    tick();
  }, []);

  return {
    paths,
    setPaths,
    pushPaths,
    undo,
    redo,
    // eslint-disable-next-line react-hooks/refs -- the stacks live in refs and tick() re-renders whenever their length changes
    canUndo: undoStack.current.length > 0,
    // eslint-disable-next-line react-hooks/refs -- same as canUndo
    canRedo: redoStack.current.length > 0,
    resetHistory,
  };
}
