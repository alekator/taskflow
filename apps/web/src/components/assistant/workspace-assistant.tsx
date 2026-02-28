"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import {
  listAssistantHistory,
  sendAssistantMessage,
  type AssistantMessage,
  type AssistantMessageMode,
} from "../../lib/assistant/api";
import {
  listNotifications,
  type NotificationItem,
} from "../../lib/notifications/api";
import { getErrorDetails } from "../../lib/errors";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function modeLabel(mode: AssistantMessageMode) {
  return mode === "LLM" ? "LLM" : "Basic";
}

function notificationsSeenStorageKey(userId: string) {
  return `taskflow.notifications.seen.${userId}`;
}

const MAX_SEEN_NOTIFICATIONS = 300;

export function WorkspaceAssistant() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [seenNotificationsReady, setSeenNotificationsReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [helperMode, setHelperMode] = useState<AssistantMessageMode>("BASIC");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [remainingLimit, setRemainingLimit] = useState<number | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(false);
  const notificationsLoadedRef = useRef(false);

  const canSend = useMemo(
    () => draft.trim().length > 0 && !sending,
    [draft, sending],
  );
  const seenNotificationIdsSet = useMemo(
    () => new Set(seenNotificationIds),
    [seenNotificationIds],
  );
  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !seenNotificationIdsSet.has(item.id)).length;
  }, [notifications, seenNotificationIdsSet]);

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingNotifications(true);
    }
    setNotificationsError(null);

    try {
      const res = await listNotifications({ page: 1, limit: 24 });
      setNotifications(res.items);
    } catch (err) {
      const details = getErrorDetails(err);
      setNotificationsError(details.message);
    } finally {
      if (!silent) {
        setLoadingNotifications(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || loadedRef.current) return;

    const run = async () => {
      setLoadingHistory(true);
      setError(null);
      try {
        const history = await listAssistantHistory({
          page: 1,
          limit: 60,
          sortOrder: "asc",
        });
        setMessages(history.items);
        loadedRef.current = true;
      } catch (err) {
        const details = getErrorDetails(err);
        setError(details.message);
      } finally {
        setLoadingHistory(false);
      }
    };

    void run();
  }, [open]);

  useEffect(() => {
    if (!notificationsOpen && notificationsLoadedRef.current) return;
    if (!notificationsOpen) return;

    notificationsLoadedRef.current = true;
    void loadNotifications();
  }, [loadNotifications, notificationsOpen]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void loadNotifications(true);

    const timer = window.setInterval(() => {
      void loadNotifications(true);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [isAuthenticated, loadNotifications]);

  useEffect(() => {
    if (!user) {
      setSeenNotificationIds([]);
      setSeenNotificationsReady(false);
      return;
    }

    try {
      const raw = window.localStorage.getItem(
        notificationsSeenStorageKey(user.id),
      );
      if (!raw) {
        setSeenNotificationIds([]);
        setSeenNotificationsReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setSeenNotificationIds([]);
        setSeenNotificationsReady(true);
        return;
      }

      setSeenNotificationIds(
        parsed
          .filter((value): value is string => typeof value === "string")
          .slice(0, MAX_SEEN_NOTIFICATIONS),
      );
      setSeenNotificationsReady(true);
    } catch {
      setSeenNotificationIds([]);
      setSeenNotificationsReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !seenNotificationsReady) return;

    window.localStorage.setItem(
      notificationsSeenStorageKey(user.id),
      JSON.stringify(seenNotificationIds.slice(0, MAX_SEEN_NOTIFICATIONS)),
    );
  }, [seenNotificationIds, seenNotificationsReady, user]);

  useEffect(() => {
    if (!open) return;
    const container = feedRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const container = notificationsRef.current;
    if (!container) return;
    container.scrollTop = 0;
  }, [notifications, notificationsOpen]);

  if (!isAuthenticated || !user) {
    return null;
  }

  const onSend = async () => {
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    setDraft("");

    try {
      const res = await sendAssistantMessage(text);
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
      setHelperMode(res.mode);
      setLlmEnabled(res.llmEnabled);
      setRemainingLimit(res.remainingDailyLimit);
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const notificationToneClass = (item: NotificationItem) => {
    if (item.type === "task") return "notifications-item-task";
    if (item.type === "project") return "notifications-item-project";
    if (item.type === "security") return "notifications-item-security";
    return "notifications-item-workspace";
  };

  const markNotificationSeen = (notificationId: string) => {
    setSeenNotificationIds((prev) => {
      if (prev.includes(notificationId)) return prev;
      return [notificationId, ...prev].slice(0, MAX_SEEN_NOTIFICATIONS);
    });
  };

  return (
    <>
      <button
        type="button"
        className="assistant-fab assistant-fab-notify"
        aria-label={notificationsOpen ? "Close notifications" : "Open notifications"}
        data-testid="notifications-toggle"
        title={notificationsOpen ? "Close notifications" : "Open notifications"}
        onClick={() => {
          setNotificationsOpen((prev) => {
            const next = !prev;
            if (next) {
              setOpen(false);
            }
            return next;
          });
        }}
      >
        {"\u{1F514}"}
        {unreadCount > 0 ? (
          <span className="assistant-fab-badge" data-testid="notifications-count">
            {Math.min(unreadCount, 9)}{unreadCount > 9 ? "+" : ""}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        className="assistant-fab assistant-fab-chat"
        aria-label={open ? "Close assistant chat" : "Open assistant chat"}
        title={open ? "Close assistant chat" : "Open assistant chat"}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              setNotificationsOpen(false);
            }
            return next;
          });
        }}
      >
        {"\u{1F4AC}"}
      </button>

      <section
        className={`notifications-drawer${notificationsOpen ? " notifications-drawer-open" : ""}`}
        aria-hidden={!notificationsOpen}
        data-testid="notifications-drawer"
      >
        <header className="assistant-drawer-head notifications-drawer-head">
          <div>
            <strong>Notifications</strong>
            <p className="meta">
              Recent changes across tasks, projects, and workspace activity
            </p>
          </div>
          <button
            type="button"
            className="button button-ghost button-compact"
            onClick={() => setNotificationsOpen(false)}
          >
            Hide
          </button>
        </header>

        <div className="notifications-feed" ref={notificationsRef}>
          {loadingNotifications ? <p className="meta">Loading notifications...</p> : null}
          {notificationsError ? <p className="error-text">{notificationsError}</p> : null}
          {!loadingNotifications && !notificationsError && notifications.length === 0 ? (
            <div className="assistant-empty">
              <p>No notifications yet. Relevant task and project changes will appear here.</p>
            </div>
          ) : null}

          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`notifications-item ${notificationToneClass(item)}${item.isOwnAction ? " notifications-item-own" : ""}${seenNotificationIdsSet.has(item.id) ? " notifications-item-seen" : ""}`}
              data-testid="notification-item"
              onMouseEnter={() => markNotificationSeen(item.id)}
              onClick={() => {
                markNotificationSeen(item.id);
                setNotificationsOpen(false);
                router.push(item.href);
              }}
            >
              <div className="notifications-item-top">
                <strong>{item.title}</strong>
                <span className="meta">
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p>{item.message}</p>
              <div className="notifications-item-meta">
                <span className="badge badge-neutral">
                  {item.type}
                </span>
                {item.projectId ? (
                  <span className="meta">project {item.projectId.slice(0, 8)}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section
        className={`assistant-drawer${open ? " assistant-drawer-open" : ""}`}
        aria-hidden={!open}
      >
        <header className="assistant-drawer-head">
          <div>
            <strong>TaskFlow assistant</strong>
            <p className="meta">
              {llmEnabled
                ? `Mode: ${modeLabel(helperMode)}${remainingLimit !== null ? ` | limit left ${remainingLimit}` : ""}`
                : "Mode: Basic (no key configured)"}
            </p>
          </div>
          <button
            type="button"
            className="button button-ghost button-compact"
            onClick={() => setOpen(false)}
          >
            Hide
          </button>
        </header>

        <div className="assistant-feed" ref={feedRef}>
          {loadingHistory ? <p className="meta">Loading history...</p> : null}
          {!loadingHistory && messages.length === 0 ? (
            <div className="assistant-empty">
              <p>No messages yet. Ask about your workspace stats, tasks, and statuses.</p>
            </div>
          ) : null}

          {messages.map((item) => {
            const mine = item.role === "USER";
            const sender = mine ? (user.name || user.email) : "TaskFlow assistant";
            return (
              <article
                key={item.id}
                className={`assistant-message${mine ? " assistant-message-user" : " assistant-message-bot"}`}
              >
                <div className="assistant-message-head">
                  <strong>{sender}</strong>
                  <span className="meta">
                    {modeLabel(item.mode)} | {formatTime(item.createdAt)}
                  </span>
                </div>
                <p>{item.message}</p>
              </article>
            );
          })}
        </div>

        <div className="assistant-input">
          {error ? <p className="error-text">{error}</p> : null}
          <textarea
            value={draft}
            placeholder="Ask TaskFlow assistant..."
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) void onSend();
              }
            }}
          />
          <div className="assistant-input-row">
            <span className="meta">{draft.length}/2000</span>
            <button
              type="button"
              className="button button-primary button-compact"
              disabled={!canSend}
              onClick={() => void onSend()}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
