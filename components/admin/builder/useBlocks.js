"use client";

import { useCallback, useMemo, useReducer } from "react";
import { cloneBlock } from "@/lib/blog/blocks/model";

// Blok listesi ve geri al / ileri al geçmişi. Her değişiklik yeni bir dizi
// üretir; aynı alana art arda yazılanlar (coalesceKey) tek adımda toplanır.
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

function reducer(state, action) {
  switch (action.type) {
    case "commit": {
      if (action.blocks === state.blocks) return state;
      const coalesce =
        action.key && action.key === state.lastKey && action.at - state.lastAt < COALESCE_MS;
      return {
        blocks: action.blocks,
        past: coalesce ? state.past : [...state.past.slice(-HISTORY_LIMIT + 1), state.blocks],
        future: [],
        lastKey: action.key ?? null,
        lastAt: action.at,
      };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      return {
        blocks: state.past.at(-1),
        past: state.past.slice(0, -1),
        future: [state.blocks, ...state.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      return {
        blocks: state.future[0],
        past: [...state.past, state.blocks],
        future: state.future.slice(1),
        lastKey: null,
        lastAt: 0,
      };
    }
    default:
      return state;
  }
}

export function useBlocks(initialBlocks) {
  const [state, dispatch] = useReducer(reducer, {
    blocks: initialBlocks,
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
  });

  const commit = useCallback(
    (update, key) =>
      dispatch({ type: "commit", key, at: Date.now(), blocks: update }),
    []
  );

  const { blocks } = state;

  const actions = useMemo(
    () => ({
      insert: (current, index, newBlocks) =>
        commit([...current.slice(0, index), ...newBlocks, ...current.slice(index)]),
      replaceAll: (newBlocks) => commit(newBlocks),
      updateProps: (current, id, patch, field) =>
        commit(
          current.map((block) =>
            block.id === id ? { ...block, props: { ...block.props, ...patch } } : block
          ),
          field ? `${id}:${field}` : undefined
        ),
      move: (current, id, toIndex) => {
        const from = current.findIndex((block) => block.id === id);
        if (from === -1) return;
        // Hedef, blok yerinden çıkarılmadan önceki sıraya göre verilir.
        const target = toIndex > from ? toIndex - 1 : toIndex;
        if (target === from) return;
        const next = current.filter((block) => block.id !== id);
        next.splice(target, 0, current[from]);
        commit(next);
      },
      duplicate: (current, id) => {
        const index = current.findIndex((block) => block.id === id);
        if (index === -1) return null;
        const copy = cloneBlock(current[index]);
        commit([...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
        return copy.id;
      },
      remove: (current, id) => commit(current.filter((block) => block.id !== id)),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [commit]
  );

  return { blocks, actions, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
