"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import {
  listAssistantHistory,
  sendAssistantMessage,
  type AssistantMessage,
  type AssistantMessageMode,
} from "../../lib/assistant/api";
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

export function WorkspaceAssistant() {
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [helperMode, setHelperMode] = useState<AssistantMessageMode>("BASIC");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [remainingLimit, setRemainingLimit] = useState<number | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(false);

  const canSend = useMemo(
    () => draft.trim().length > 0 && !sending,
    [draft, sending],
  );

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
    if (!open) return;
    const container = feedRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, open]);

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

  return (
    <>
      <button
        type="button"
        className="assistant-fab assistant-fab-notify"
        aria-label="Notifications (coming soon)"
        title="Notifications (coming soon)"
      >
        {"\u{1F514}"}
      </button>

      <button
        type="button"
        className="assistant-fab assistant-fab-chat"
        aria-label={open ? "Close assistant chat" : "Open assistant chat"}
        title={open ? "Close assistant chat" : "Open assistant chat"}
        onClick={() => setOpen((v) => !v)}
      >
        {"\u{1F4AC}"}
      </button>

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
