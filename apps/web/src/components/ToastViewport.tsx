import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export type ToastMessage = {
  actionHref?: string;
  actionLabel?: string;
  actionOnClick?: () => void;
  autoDismiss?: boolean;
  className?: string;
  id: string;
  isDismissible?: boolean;
  isLoading?: boolean;
  text: string;
  type: ToastType;
};

type ToastViewportProps = {
  autoDismissMs?: number;
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
  variant?: 'stack' | 'banner';
};

const TOAST_ICON_LABELS = {
  error: '!',
  info: 'i',
  success: '✓',
  warning: '!',
} satisfies Record<ToastType, string>;

const TOAST_ROLE = {
  error: 'alert',
  info: 'status',
  success: 'status',
  warning: 'alert',
} satisfies Record<ToastType, 'alert' | 'status'>;
const TOAST_EXIT_ANIMATION_MS = 220;

export const ToastViewport = ({
  autoDismissMs = 3000,
  messages,
  onDismiss,
  variant = 'stack',
}: ToastViewportProps) => {
  const timers = useRef<Map<string, number>>(new Map());
  const exitTimers = useRef<Map<string, number>>(new Map());
  const [pausedIds, setPausedIds] = useState<Set<string>>(() => new Set());
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());

  const dismissWithAnimation = useCallback(
    (id: string) => {
      if (exitTimers.current.has(id)) {
        return;
      }

      const autoTimer = timers.current.get(id);
      if (autoTimer) {
        window.clearTimeout(autoTimer);
        timers.current.delete(id);
      }

      setExitingIds((current) => new Set(current).add(id));
      const exitTimer = window.setTimeout(() => {
        exitTimers.current.delete(id);
        setExitingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        onDismiss(id);
      }, TOAST_EXIT_ANIMATION_MS);
      exitTimers.current.set(id, exitTimer);
    },
    [onDismiss],
  );

  useEffect(() => {
    const activeIds = new Set(messages.map((message) => message.id));

    for (const [id, timer] of timers.current) {
      if (!activeIds.has(id) || pausedIds.has(id) || exitingIds.has(id)) {
        window.clearTimeout(timer);
        timers.current.delete(id);
      }
    }

    for (const [id, timer] of exitTimers.current) {
      if (!activeIds.has(id)) {
        window.clearTimeout(timer);
        exitTimers.current.delete(id);
      }
    }

    for (const message of messages) {
      if (
        message.autoDismiss === false ||
        pausedIds.has(message.id) ||
        exitingIds.has(message.id) ||
        timers.current.has(message.id)
      ) {
        continue;
      }

      const timer = window.setTimeout(() => {
        timers.current.delete(message.id);
        dismissWithAnimation(message.id);
      }, Math.max(0, autoDismissMs - TOAST_EXIT_ANIMATION_MS));
      timers.current.set(message.id, timer);
    }
  }, [autoDismissMs, dismissWithAnimation, exitingIds, messages, pausedIds]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }

      for (const timer of exitTimers.current.values()) {
        window.clearTimeout(timer);
      }

      timers.current.clear();
      exitTimers.current.clear();
    };
  }, []);

  if (messages.length === 0) {
    return null;
  }

  const viewport = (
    <div
      className={variant === 'banner' ? 'toast-stack toast-stack--banner' : 'toast-stack'}
      aria-label="页面通知"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={[
            'toast',
            `toast--${message.type}`,
            isDeleteSuccessToast(message) ? 'toast--delete-success' : '',
            message.className,
            exitingIds.has(message.id) ? 'is-exiting' : '',
          ].filter(Boolean).join(' ')}
          role={TOAST_ROLE[message.type]}
          onMouseEnter={() => setPausedIds((current) => new Set(current).add(message.id))}
          onMouseLeave={() =>
            setPausedIds((current) => {
              const next = new Set(current);
              next.delete(message.id);
              return next;
            })
          }
        >
          <span className="toast__icon" aria-hidden="true">
            {TOAST_ICON_LABELS[message.type]}
          </span>
          <span className="toast__text">{normalizeToastText(message.text)}</span>
          {message.actionOnClick && message.actionLabel ? (
            <button className="toast__action" type="button" onClick={message.actionOnClick}>
              {message.actionLabel}
            </button>
          ) : message.actionHref && message.actionLabel ? (
            <a className="toast__action" href={message.actionHref}>
              {message.actionLabel}
            </a>
          ) : null}
          {message.isLoading ? <span className="toast__spinner" aria-hidden="true" /> : null}
          {message.isDismissible === false ? null : (
            <button className="toast__close" type="button" onClick={() => dismissWithAnimation(message.id)}>
              <span className="visually-hidden">关闭提示</span>
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );

  if (typeof document === 'undefined') {
    return viewport;
  }

  return createPortal(viewport, document.body);
};

export const createStatusToast = (text: string): ToastMessage => ({
  id: 'status',
  text: normalizeToastText(text),
  type: 'success',
});

export const createInfoToast = (text: string): ToastMessage => ({
  id: 'info',
  text: normalizeToastText(text),
  type: 'info',
});

export const createErrorToast = (text: string): ToastMessage => ({
  id: 'error',
  text: normalizeToastText(text),
  type: shouldUseWarningToast(text) ? 'warning' : 'error',
});

export const useToastController = () => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const toastSequenceRef = useRef(0);

  const showToast = useCallback((message: ToastMessage) => {
    toastSequenceRef.current += 1;
    const toastId = `${message.id}-${Date.now()}-${toastSequenceRef.current}`;
    setMessages((current) => [
      ...current,
      {
        ...message,
        id: toastId,
      },
    ].slice(-4));
  }, []);

  const showStatusToast = useCallback(
    (message: string, options?: Pick<ToastMessage, 'actionHref' | 'actionLabel' | 'actionOnClick' | 'autoDismiss' | 'className'>) => {
      showToast({
        ...createStatusToast(message),
        ...options,
      });
    },
    [showToast],
  );

  const showInfoToast = useCallback(
    (message: string, options?: Pick<ToastMessage, 'actionHref' | 'actionLabel' | 'actionOnClick' | 'autoDismiss' | 'className'>) => {
      showToast({
        ...createInfoToast(message),
        ...options,
      });
    },
    [showToast],
  );

  const showErrorToast = useCallback(
    (message: string, options?: Pick<ToastMessage, 'actionHref' | 'actionLabel' | 'actionOnClick' | 'autoDismiss' | 'className'>) => {
      showToast({
        ...createErrorToast(message),
        ...options,
      });
    },
    [showToast],
  );

  const dismissToast = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    clearToasts,
    dismissToast,
    messages,
    showErrorToast,
    showInfoToast,
    showStatusToast,
    showToast,
  };
};

const shouldUseWarningToast = (text: string): boolean =>
  /不存在|已被删除|请选择|缺少|无法/.test(text);

const normalizeToastText = (text: string): string =>
  text
    .replace(/（HTTP\s*\d+）。?/gi, '。')
    .replace(/\s*\(HTTP\s*\d+\)\.?/gi, '.')
    .replace(/。。+/g, '。')
    .replace(/。+$/g, '')
    .trim();

const isDeleteSuccessToast = (message: ToastMessage): boolean =>
  (message.type === 'success' || message.type === 'info') &&
  /(?:已删除|删除成功|删除完毕)/.test(normalizeToastText(message.text));
