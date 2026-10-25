"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { cloneBlock } from "@/lib/blog/blocks/model";

// Blok listesi ve geri al / ileri al geçmişi. Her değişiklik yeni bir dizi
// üretir; aynı alana art arda yazılanlar (coalesceKey) tek adımda toplanır.
// Bir değişiklik blok dışı bir alanı da etkiliyorsa (ör. görsel eklerken kapak),
// `replaceAll(blocks, { before, after })` ile bu alanın önceki/sonraki değeri
// geçişe iliştirilir; undo/redo bu değeri döndürür, çağıran onu forma uygular.
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
  // Geçişe iliştirilen form değişiklikleri: hedef blok dizisi → { before, after }.
  const metaFor = useRef(new WeakMap());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { blocks } = state;

  const actions = useMemo(
    () => ({
      insert: (current, index, newBlocks) =>
        commit([...current.slice(0, index), ...newBlocks, ...current.slice(index)]),
      replaceAll: (newBlocks, meta = null) => {
        if (meta) metaFor.current.set(newBlocks, meta);
        commit(newBlocks);
      },
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
      // Dönüş: geri alınan geçişin form değişikliği varsa önceki değeri, yoksa null.
      undo: () => {
        const current = stateRef.current;
        if (current.past.length === 0) return null;
        dispatch({ type: "undo" });
        return metaFor.current.get(current.blocks)?.before ?? null;
      },
      redo: () => {
        const current = stateRef.current;
        if (current.future.length === 0) return null;
        dispatch({ type: "redo" });
        return metaFor.current.get(current.future[0])?.after ?? null;
      },
    }),
    [commit]
  );

  return { blocks, actions, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
