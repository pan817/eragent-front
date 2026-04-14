import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  placement?: 'bottom-start' | 'bottom-end';
  /** Vertical gap between anchor and popover */
  gap?: number;
  /** Force minimum width to match anchor */
  matchAnchorWidth?: boolean;
}

/**
 * 轻量级 Popover：createPortal 到 document.body，position:fixed 计算位置。
 * - 上方空间不足时自动翻转向上
 * - 监听 scroll + resize 重新计算
 * - 点击外部或按 Esc 关闭
 */
export default function Popover({
  open,
  anchorEl,
  onClose,
  children,
  className,
  placement = 'bottom-start',
  gap = 6,
  matchAnchorWidth = false,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: -9999,
    visibility: 'hidden',
    zIndex: 2000,
  });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const compute = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popEl = popoverRef.current;
      const popH = popEl ? popEl.offsetHeight : 0;
      const popW = popEl ? popEl.offsetWidth : 0;
      const vpH = window.innerHeight;
      const vpW = window.innerWidth;
      const spaceBelow = vpH - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < popH && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(8, rect.top - gap - popH)
        : Math.min(vpH - popH - 8, rect.bottom + gap);
      const base: CSSProperties = {
        position: 'fixed',
        top,
        zIndex: 2000,
        visibility: 'visible',
      };
      if (matchAnchorWidth) base.minWidth = rect.width;
      if (placement === 'bottom-end') {
        const right = Math.max(8, vpW - rect.right);
        base.right = right;
      } else {
        // clamp left to stay in viewport
        const left = Math.min(Math.max(8, rect.left), vpW - popW - 8);
        base.left = left;
      }
      setStyle(base);
    };
    // 两阶段：首次渲染用初始（隐藏）样式获得真实尺寸 → 再次 compute
    compute();
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open, anchorEl, placement, gap, matchAnchorWidth]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, anchorEl, onClose]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div ref={popoverRef} className={className} style={style}>
      {children}
    </div>,
    document.body,
  );
}
