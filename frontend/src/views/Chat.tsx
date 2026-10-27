import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { streamChat } from '../lib/stream';
import type { ConversationSummary, SourceStatus } from '../types';
import { useToast } from '../state/toast';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { Modal } from '../components/Modal';
import { ConversationList } from './chat/ConversationList';
import { CitationsDrawer } from './chat/CitationsDrawer';

interface UiMessage {
  id: number | null;
  question: string;
  answer: string;
  sources: string[];
  source_statuses?: SourceStatus[];
  streaming?: boolean;
  error?: string | null;
  rating?: 'up' | 'down' | null;
}

const FAILURE_TAGS: { value: string; label: string }[] = [
  { value: 'bad_retrieval', label: 'Missed the right passage' },
  { value: 'hallucination', label: 'Answer not in my documents' },
  { value: 'incomplete', label: 'Cut off or incomplete' },
  { value: 'other', label: 'Something else' },
];

const SUGGESTIONS = [
  'Summarize the key points across my documents',
  'What dates or deadlines appear in my files?',
  'Explain the main argument in plain language',
  'Where do my documents disagree?',
];

/**
 * Memoised answer body. While one answer streams, the other rows keep the
 * same `message` object, so their markdown is not re-parsed on every frame.
 */
const AnswerBody = memo(function AnswerBody({
  message,
  onOpenCitations,
}: {
  message: UiMessage;
  onOpenCitations: (message: UiMessage, focus: number | null) => void;
}) {
  const onCite = useCallback(
    (n: number) => onOpenCitations(message, n),
    [message, onOpenCitations],
  );
  return <Markdown text={message.answer} onCite={message.id !== null ? onCite : undefined} />;
});

export function Chat() {
  const navigate = useNavigate();
  const params = useParams<{ conversationId?: string }>();
  const toast = useToast();

  const paramId = Number(params.conversationId);
  const activeId: number | null = Number.isInteger(paramId) && paramId > 0 ? paramId : null;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [filter, setFilter] = useState('');
  const [convOpen, setConvOpen] = useState(false);
  const [citations, setCitations] = useState<{ chatId: number; focus: number | null } | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackTag, setFeedbackTag] = useState('');
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await api.chat.history();
      setConversations(res.conversations);
    } catch {
      // the rail still works; history is not critical-path
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (activeId === null) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    api.chat
      .conversation(activeId)
      .then((detail) => {
        if (cancelled) return;
        setMessages(
          detail.messages.map((msg) => ({
            id: msg.id,
            question: msg.question,
            answer: msg.answer,
            sources: msg.sources,
            source_statuses: msg.source_statuses,
            rating: null,
          })),
        );
      })
      .catch((err: Error) => {
        if (!cancelled) toast.push(err.message, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, toast]);

  const stickRef = useRef(true);
  const pendingTokens = useRef('');
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  /* Tokens arrive many times per second. Buffer them and paint once per
     frame so the transcript is not re-parsed and re-scrolled on each one. */
  const flushTokens = useCallback(() => {
    frameRef.current = null;
    const chunk = pendingTokens.current;
    if (!chunk) return;
    pendingTokens.current = '';
    setMessages((current) => {
      const next = current.slice();
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = { ...last, answer: last.answer + chunk };
      return next;
    });
  }, []);

  const stopTokens = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingTokens.current = '';
  }, []);

  const appendToken = useCallback(
    (token: string) => {
      pendingTokens.current += token;
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushTokens);
    },
    [flushTokens],
  );

  const send = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || streaming) return;

      setInput('');
      setFeedbackFor(null);
      stickRef.current = true;
      setMessages((current) => [
        ...current,
        { id: null, question, answer: '', sources: [], streaming: true, error: null },
      ]);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const done = await streamChat({
          question,
          conversationId: activeId ?? undefined,
          signal: controller.signal,
          onToken: appendToken,
        });
        stopTokens();
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last) {
            next[next.length - 1] = {
              ...last,
              id: done.id ?? null,
              answer: done.answer,
              sources: done.sources,
              source_statuses: done.source_statuses,
              streaming: false,
            };
          }
          return next;
        });
        if (activeId === null && done.conversation_id) {
          navigate(`/chat/${done.conversation_id}`, { replace: true });
        }
        void refreshHistory();
      } catch (err) {
        stopTokens();
        const aborted = err instanceof Error && err.name === 'AbortError';
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last) {
            next[next.length - 1] = {
              ...last,
              streaming: false,
              error: aborted
                ? null
                : err instanceof Error
                  ? err.message
                  : 'The answer failed to generate.',
            };
          }
          return next;
        });
        if (!aborted) void refreshHistory();
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, appendToken, navigate, refreshHistory, stopTokens, streaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const rate = useCallback(
    async (message: UiMessage, rating: 'up' | 'down', comment = '', failure_tag = '') => {
      if (message.id === null) return;
      try {
        await api.chat.feedback(message.id, rating, comment, failure_tag);
        setMessages((current) =>
          current.map((msg) => (msg.id === message.id ? { ...msg, rating } : msg)),
        );
        setFeedbackFor(null);
        setFeedbackComment('');
        setFeedbackTag('');
        toast.push('Feedback saved. It feeds the evaluation loop.', 'success');
      } catch (err) {
        toast.push(err instanceof Error ? err.message : 'Could not save feedback.', 'error');
      }
    },
    [toast],
  );

  const startDownFeedback = useCallback((index: number) => {
    setFeedbackFor((current) => (current === index ? null : index));
    setFeedbackComment('');
    setFeedbackTag('');
  }, []);

  const copyAnswer = useCallback(
    async (message: UiMessage) => {
      try {
        await navigator.clipboard.writeText(message.answer);
        toast.push('Answer copied.', 'success');
      } catch {
        toast.push('Could not access the clipboard.', 'error');
      }
    },
    [toast],
  );

  const exportMessage = useCallback(
    async (message: UiMessage, format: 'markdown' | 'json') => {
      if (message.id === null) return;
      try {
        const blob = await api.chat.export(message.id, format);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `chat_${message.id}.${format === 'markdown' ? 'md' : 'json'}`;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast.push(err instanceof Error ? err.message : 'Export failed.', 'error');
      }
    },
    [toast],
  );

  const openCitations = useCallback(
    (message: UiMessage, focus: number | null) => {
      if (message.id === null) {
        toast.push('This answer has no citations yet.', 'info');
        return;
      }
      setCitations({ chatId: message.id, focus });
    },
    [toast],
  );

  const togglePin = useCallback(
    async (conv: ConversationSummary) => {
      try {
        await api.chat.updateConversation(conv.id, { pinned: !conv.pinned });
        void refreshHistory();
      } catch (err) {
        toast.push(err instanceof Error ? err.message : 'Could not update the conversation.', 'error');
      }
    },
    [refreshHistory, toast],
  );

  const submitRename = useCallback(async () => {
    if (!renaming) return;
    const title = renameValue.trim();
    if (!title) return;
    try {
      await api.chat.updateConversation(renaming.id, { title });
      setRenaming(null);
      void refreshHistory();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Rename failed.', 'error');
    }
  }, [renaming, renameValue, refreshHistory, toast]);

  const submitDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.chat.deleteConversation(deleting.id);
      setDeleting(null);
      if (deleting.id === activeId) {
        navigate('/chat', { replace: true });
      }
      void refreshHistory();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }, [deleting, activeId, navigate, refreshHistory, toast]);

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const activeConversation = conversations.find((conv) => conv.id === activeId) ?? null;

  return (
    <div className="chat">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        open={convOpen}
        filter={filter}
        onFilter={setFilter}
        onNew={() => {
          setConvOpen(false);
          navigate('/chat');
        }}
        onOpen={(id) => {
          setConvOpen(false);
          navigate(`/chat/${id}`);
        }}
        onTogglePin={(conv) => void togglePin(conv)}
        onRename={(conv) => {
          setRenaming(conv);
          setRenameValue(conv.title);
        }}
        onDelete={setDeleting}
      />
      {convOpen && (
        <button
          type="button"
          className="drawer-overlay"
          style={{ zIndex: 54 }}
          aria-label="Close conversation list"
          onClick={() => setConvOpen(false)}
        />
      )}

      <section className="chat-main">
        <div className="chat-topbar">
          <button
            type="button"
            className="btn-icon conv-toggle"
            onClick={() => setConvOpen(true)}
            aria-label="Open conversation list"
          >
            <Icon name="panel" size={17} />
          </button>
          <span className="conv-title">{activeConversation?.title ?? 'New conversation'}</span>
        </div>

        {messages.length === 0 && !streaming ? (
          <div className="chat-welcome">
            <h2>What should we look up?</h2>
            <p className="lede">
              Answers come from the documents you indexed. Each one cites the passage it used, so
              you can check the source in one click.
            </p>
            <div className="suggest-row">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="suggest-chip"
                  onClick={() => {
                    setInput(suggestion);
                    composerRef.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="msg-scroll"
            ref={scrollRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            <div className="msg-col">
              {messages.map((message, index) => (
                <div key={message.id ?? `pending-${index}`}>
                  <div className="msg-q">
                    <div className="bubble">{message.question}</div>
                  </div>
                  <div className="msg-a" style={{ marginTop: 12 }}>
                    {message.error ? (
                      <div className="msg-error" role="alert">
                        {message.error}
                      </div>
                    ) : (
                      <AnswerBody message={message} onOpenCitations={openCitations} />
                    )}
                    {message.streaming && <span className="caret" aria-hidden="true" />}

                    {!message.streaming && message.sources.length > 0 && (
                      <div className="msg-foot">
                        <div className="src-row">
                          <span className="src-label">Sources</span>
                          {message.source_statuses?.length
                            ? message.source_statuses.map((status) => (
                                <button
                                  key={status.name}
                                  type="button"
                                  className={`src-chip${status.available ? '' : ' missing'}`}
                                  onClick={
                                    status.available
                                      ? () => openCitations(message, null)
                                      : undefined
                                  }
                                  title={
                                    status.available
                                      ? `Show citations from ${status.name}`
                                      : 'This file was removed after the answer was generated'
                                  }
                                >
                                  <span className="name">{status.name}</span>
                                </button>
                              ))
                            : message.sources.map((source) => (
                                <button
                                  key={source}
                                  type="button"
                                  className="src-chip"
                                  onClick={() => openCitations(message, null)}
                                >
                                  <span className="name">{source}</span>
                                </button>
                              ))}
                        </div>

                        <div className={`msg-actions${message.rating ? ' reveal' : ''}`}>
                          <button
                            type="button"
                            className={`btn-icon rate-btn${message.rating === 'up' ? ' liked' : ''}`}
                            title="Good answer"
                            disabled={message.id === null}
                            onClick={() => void rate(message, 'up')}
                          >
                            <Icon name="thumbsUp" size={15} />
                          </button>
                          <button
                            type="button"
                            className={`btn-icon rate-btn${message.rating === 'down' ? ' disliked' : ''}`}
                            title="Report a problem with this answer"
                            disabled={message.id === null}
                            onClick={() => startDownFeedback(index)}
                          >
                            <Icon name="thumbsDown" size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            title="Copy answer"
                            onClick={() => void copyAnswer(message)}
                          >
                            <Icon name="copy" size={15} />
                          </button>
                          {message.id !== null && (
                            <>
                              <button
                                type="button"
                                className="btn-icon"
                                title="Export as Markdown"
                                onClick={() => void exportMessage(message, 'markdown')}
                              >
                                <Icon name="download" size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon"
                                title="Show citations"
                                onClick={() => openCitations(message, null)}
                              >
                                <Icon name="eye" size={15} />
                              </button>
                            </>
                          )}
                        </div>

                        {feedbackFor === index && (
                          <form
                            className="feedback-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void rate(message, 'down', feedbackComment, feedbackTag);
                            }}
                          >
                            <span className="small" style={{ color: 'var(--ink-2)' }}>
                              What went wrong? This feeds the evaluation page.
                            </span>
                            <div className="tags">
                              {FAILURE_TAGS.map((tag) => (
                                <button
                                  key={tag.value}
                                  type="button"
                                  className={`fail-tag${feedbackTag === tag.value ? ' selected' : ''}`}
                                  onClick={() => setFeedbackTag(tag.value)}
                                >
                                  {tag.label}
                                </button>
                              ))}
                            </div>
                            <textarea
                              className="input"
                              rows={2}
                              placeholder="Anything else worth noting (optional)"
                              value={feedbackComment}
                              onChange={(e) => setFeedbackComment(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setFeedbackFor(null)}
                              >
                                Cancel
                              </button>
                              <button type="submit" className="btn btn-primary btn-sm">
                                Send feedback
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="composer-wrap">
          <div className="composer">
            <textarea
              ref={composerRef}
              rows={1}
              name="question"
              placeholder="Ask your documents…"
              aria-label="Ask your documents"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`;
              }}
              onKeyDown={onComposerKeyDown}
            />
            {streaming ? (
              <button
                type="button"
                className="send-btn stop"
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Icon name="stop" size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={() => void send(input)}
                disabled={!input.trim()}
                aria-label="Send question"
                title="Send"
              >
                <Icon name="send" size={17} />
              </button>
            )}
          </div>
          <p className="composer-hint">Enter to send, Shift+Enter for a new line</p>
        </div>
      </section>

      <CitationsDrawer
        chatId={citations?.chatId ?? null}
        focusCite={citations?.focus ?? null}
        onClose={() => setCitations(null)}
      />

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename conversation"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitRename()}
              disabled={!renameValue.trim()}
            >
              Save name
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="conv-rename">Title</label>
          <input
            id="conv-rename"
            className="input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitRename();
            }}
          />
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this conversation?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void submitDelete()}
            >
              Delete conversation
            </button>
          </>
        }
      >
        <p className="modal-body">
          {deleting ? `"${deleting.title}" and its ${deleting.message_count} messages will be removed. This cannot be undone.` : ''}
        </p>
      </Modal>
    </div>
  );
}
