import { useMemo } from 'react';
import type { ConversationSummary } from '../../types';
import { Icon } from '../../components/Icon';
import { formatWhen } from '../../lib/format';

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: number | null;
  open: boolean;
  filter: string;
  onFilter: (value: string) => void;
  onNew: () => void;
  onOpen: (id: number) => void;
  onTogglePin: (conv: ConversationSummary) => void;
  onRename: (conv: ConversationSummary) => void;
  onDelete: (conv: ConversationSummary) => void;
}

export function ConversationList({
  conversations,
  activeId,
  open,
  filter,
  onFilter,
  onNew,
  onOpen,
  onTogglePin,
  onRename,
  onDelete,
}: ConversationListProps) {
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? conversations.filter((conv) => conv.title.toLowerCase().includes(needle))
      : conversations;
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [conversations, filter]);

  return (
    <div className={`conv-col${open ? ' open' : ''}`}>
      <div className="conv-head">
        <h2>Conversations</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onNew}
          title="Start a new conversation"
        >
          <Icon name="plus" size={14} />
          New
        </button>
      </div>

      <div className="conv-search">
        <input
          className="input"
          type="search"
          placeholder="Filter conversations"
          aria-label="Filter conversations"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
        />
      </div>

      <div className="conv-list">
        {visible.length === 0 && (
          <p className="conv-empty">
            {conversations.length === 0
              ? 'Ask your first question to start a conversation.'
              : 'Nothing matches that filter.'}
          </p>
        )}
        {visible.map((conv) => (
          <div
            key={conv.id}
            className={`conv-row${conv.id === activeId ? ' active' : ''}`}
          >
            <button type="button" className="conv-item" onClick={() => onOpen(conv.id)}>
              <span className="title">
                {conv.pinned && <Icon name="pin" size={12} />}
                {conv.title}
              </span>
              <span className="meta">
                {conv.message_count}{' '}
                {conv.message_count === 1 ? 'exchange' : 'exchanges'}, {formatWhen(conv.updated_at)}
              </span>
            </button>
            <span className="conv-actions">
              <button
                type="button"
                className={`btn-icon conv-pin${conv.pinned ? ' pinned' : ''}`}
                title={conv.pinned ? 'Unpin' : 'Pin'}
                onClick={() => onTogglePin(conv)}
              >
                <Icon name="pin" size={13} />
              </button>
              <button
                type="button"
                className="btn-icon conv-pin"
                title="Rename"
                onClick={() => onRename(conv)}
              >
                <Icon name="pencil" size={13} />
              </button>
              <button
                type="button"
                className="btn-icon conv-pin danger"
                title="Delete"
                onClick={() => onDelete(conv)}
              >
                <Icon name="trash" size={13} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
