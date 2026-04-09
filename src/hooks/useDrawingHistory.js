import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY = 80;

/**
 * Manages undo/redo for an array of drawing paths.
 *
 * API:
 *   paths          – current paths array (source of truth for rendering)
 *   pushPaths(p)   – record a new snapshot (after stroke, clear, etc.)
 *   undo()         – step back
 *   redo()         – step forward
 *   canUndo / canRedo
 *   resetHistory(initial) – reset stacks (when switching drawings)
 */
export default function useDrawingHistory(initialPaths = []) {
  // Current paths state
  const [paths, setPaths] = useState(initialPaths);

  // Stacks stored as refs to avoid re-render on every push
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  // Force re-render when stack lengths change (for canUndo/canRedo)
  const [, forceUpdate] = useState(0);
  const tick = () => forceUpdate(n => n + 1);

  const pushPaths = useCallback((newPaths) => {
    setPaths(prev => {
      // Push previous state onto undo stack
      undoStack.current.push(prev);
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift();
      }
      // Clear redo on new action
      redoStack.current = [];
      tick();
      return newPaths;
    });
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return null;
    const previous = undoStack.current.pop();
    setPaths(current => {
      redoStack.current.push(current);
      tick();
      return previous;
    });
    return true; // signal that undo happened
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return null;
    const next = redoStack.current.pop();
    setPaths(current => {
      undoStack.current.push(current);
      tick();
      return next;
    });
    return true;
  }, []);

  const resetHistory = useCallback((initial = []) => {
    setPaths(initial);
    undoStack.current = [];
    redoStack.current = [];
    tick();
  }, []);

  return {
    paths,
    setPaths, // direct set without history (for loading data)
    pushPaths,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    resetHistory,
  };
}
