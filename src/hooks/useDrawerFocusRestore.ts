import { useEffect, useRef } from 'react';

/**
 * 打开可关闭面板（Drawer/Modal）时，在触发元素上记下当时的 document.activeElement；
 * 关闭时（activeId 由非 null 变 null），把焦点还回去。
 *
 * 若原触发元素已卸载/不在 DOM 中，降级到 rowRefs.get(lastActiveId) 指向的元素（如 Gantt 行）。
 *
 * 使用方式：
 *   const focusRestore = useDrawerFocusRestore(selectedSpanId, rowRefs);
 *   const toggleDetail = (id) => setSelectedSpanId(prev => {
 *     if (prev === id) return null;
 *     focusRestore.capture(id);          // 在 setState 之前捕获触发元素
 *     return id;
 *   });
 */
export function useDrawerFocusRestore(
  activeId: string | null,
  rowRefs: React.MutableRefObject<Map<string, HTMLElement>>,
) {
  const preFocusRef = useRef<HTMLElement | null>(null);
  const lastActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeId) return;
    const prev = preFocusRef.current;
    const lastId = lastActiveIdRef.current;
    preFocusRef.current = null;
    lastActiveIdRef.current = null;
    if (!prev && !lastId) return;
    requestAnimationFrame(() => {
      if (prev && document.contains(prev)) {
        prev.focus();
        return;
      }
      const row = lastId ? rowRefs.current.get(lastId) : null;
      row?.focus();
    });
  }, [activeId, rowRefs]);

  return {
    capture(id: string) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) preFocusRef.current = active;
      lastActiveIdRef.current = id;
    },
  };
}
