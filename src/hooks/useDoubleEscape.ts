import { useEffect, useRef, useCallback } from 'react';

interface UseDoubleEscapeOptions {
  /** 双击窗口时间（毫秒），默认 500ms */
  timeout?: number;
  /** 是否启用，默认 true */
  enabled?: boolean;
}

/**
 * 自定义 Hook：监听双击 Escape 键
 *
 * 对齐官方 Claude Code Rewind 功能：
 * - 双击 Esc 触发 Rewind 面板
 * - 500ms 时间窗口
 * - 防止与其他 Esc 功能冲突
 *
 * @param callback - 双击 Esc 时的回调函数
 * @param options - 配置选项
 *
 * @example
 * ```tsx
 * const [showRewind, setShowRewind] = useState(false);
 *
 * useDoubleEscape(() => {
 *   setShowRewind(true);
 * });
 * ```
 */
export function useDoubleEscape(
  callback: () => void,
  options: UseDoubleEscapeOptions = {}
) {
  const { timeout = 500, enabled = true } = options;

  const lastEscTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // 只处理 Escape 键
      if (event.key !== 'Escape') {
        return;
      }

      const now = Date.now();
      const timeSinceLastEsc = now - lastEscTimeRef.current;

      // 如果在时间窗口内，触发双击回调
      if (timeSinceLastEsc > 0 && timeSinceLastEsc < timeout) {
        // 清除计时器
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }

        // 重置计时器
        lastEscTimeRef.current = 0;

        // 触发回调
        callback();

        // 阻止默认行为和冒泡，避免关闭其他对话框
        event.preventDefault();
        event.stopPropagation();
      } else {
        // 记录本次按键时间
        lastEscTimeRef.current = now;

        // 设置超时重置
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          lastEscTimeRef.current = 0;
          timerRef.current = null;
        }, timeout);
      }
    },
    [callback, timeout]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 使用捕获阶段，优先处理
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });

      // 清理计时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [enabled, handleKeyDown]);
}