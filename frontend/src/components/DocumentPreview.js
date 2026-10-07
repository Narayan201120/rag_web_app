import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';

/* Document preview modal.
 *
 * Self-contained by design: it owns its fetch, its focus handling, and its own
 * small markdown renderer, so any panel can mount it without extra wiring.
 *
 * Contract (do not change, other workers code against it):
 *   <DocumentPreview name="notes.md" onClose={() => {}} />
 *     name    filename string to preview
 *     onClose callback fired by Escape, the close button, or an overlay click
 *
 * Backend contract of GET /api/documents/<filename>/:
 *   { name, extension, content, total_characters, truncated }
 * Errors arrive as { error: '...' }.
 */

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const HEADING_STYLES = {
    h1: { fontSize: 'var(--text-2xl)', marginTop: 'var(--space-5)' },
    h2: { fontSize: 'var(--text-xl)', marginTop: 'var(--space-5)' },
    h3: { fontSize: 'var(--text-lg)', marginTop: 'var(--space-4)' },
    h4: { fontSize: 'var(--text-base)', marginTop: 'var(--space-4)' },
    h5: { fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' },
    h6: { fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' },
};

const MATH_STYLE = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    padding: '0.1em 0.3em',
    backgroundColor: 'var(--color-panel-high)',
    borderRadius: 'var(--radius-xs)',
    whiteSpace: 'pre-wrap',
};

// $...$ and $$...$$ stay plain text on purpose. No math engine here: the shared
// preview renders them as code so nobody mistakes a raw formula for prose.
function renderInline(text, keyPrefix) {
    const parts = [];
    let rest = text;
    let index = 0;

    while (rest.length > 0) {
        const start = rest.indexOf('$');
        if (start === -1) {
            parts.push(<span key={`${keyPrefix}-t${index}`}>{rest}</span>);
            break;
        }
        if (start > 0) {
            parts.push(<span key={`${keyPrefix}-t${index}`}>{rest.slice(0, start)}</span>);
        }
        const end = rest.indexOf('$', start + 1);
        if (end === -1) {
            parts.push(<span key={`${keyPrefix}-t${index}`}>{rest.slice(start)}</span>);
            break;
        }
        parts.push(
            <code key={`${keyPrefix}-m${index}`} style={MATH_STYLE}>
                {rest.slice(start, end + 1)}
            </code>
        );
        rest = rest.slice(end + 1);
        index += 1;
    }

    return parts;
}

const LIST_STYLE = {
    margin: '0 0 var(--space-3)',
    paddingLeft: '1.5rem',
};

const PARAGRAPH_STYLE = {
    margin: '0 0 var(--space-3)',
    lineHeight: 'var(--leading-relaxed)',
};

const BLOCKQUOTE_STYLE = {
    margin: '0 0 var(--space-3)',
    padding: 'var(--space-1) 0 var(--space-1) var(--space-3)',
    borderLeft: '3px solid var(--color-border-strong)',
    color: 'var(--color-text-muted)',
};

/* A deliberately small markdown reader: headings, paragraphs, ordered and
 * unordered lists, blockquotes, and inline math as text. Enough to read a
 * note without a parser dependency. */
function renderMarkdown(content) {
    const text = String(content || '');
    const blocks = [];
    let listItems = { items: [], startIndex: 1 };
    let listType = null;
    let key = 0;

    const flushList = () => {
        if (!listItems.items.length) return;
        const Tag = listType === 'ol' ? 'ol' : 'ul';
        const start = listType === 'ol' ? listItems.startIndex : null;
        blocks.push(
            <Tag key={`list-${key++}`} start={start || undefined} style={LIST_STYLE}>
                {listItems.items.map((item, i) => (
                    <li key={i} style={{ marginBottom: 'var(--space-1)' }}>
                        {renderInline(item, `li-${key}-${i}`)}
                    </li>
                ))}
            </Tag>
        );
        listItems = { items: [], startIndex: 1 };
        listType = null;
    };

    const pushItem = (item, orderedIndex) => {
        const nextType = orderedIndex ? 'ol' : 'ul';
        // A type switch has to end the current list, otherwise ordered and
        // unordered items end up merged into one list.
        if (listType && listType !== nextType) flushList();
        if (!listType) {
            listType = nextType;
            listItems = { items: [], startIndex: orderedIndex };
        }
        listItems.items.push(item);
    };

    for (const raw of text.split('\n')) {
        const line = raw.trim();

        if (!line) {
            flushList();
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushList();
            const level = Math.min(heading[1].length, 6);
            const Tag = HEADING_TAGS[level - 1];
            blocks.push(
                <Tag
                    key={`h-${key++}`}
                    style={{
                        ...HEADING_STYLES[Tag],
                        marginBottom: 'var(--space-2)',
                        fontFamily: 'var(--font-ui)',
                        lineHeight: 'var(--leading-tight)',
                        color: 'var(--color-text)',
                    }}
                >
                    {renderInline(heading[2], `h-${key}`)}
                </Tag>
            );
            continue;
        }

        const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
        if (ordered) {
            pushItem(ordered[2], parseInt(ordered[1], 10));
            continue;
        }

        const unordered = line.match(/^[-*+]\s+(.*)$/);
        if (unordered) {
            pushItem(unordered[1], 0);
            continue;
        }

        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
            flushList();
            blocks.push(
                <blockquote key={`bq-${key++}`} style={BLOCKQUOTE_STYLE}>
                    {renderInline(quote[1], `bq-${key}`)}
                </blockquote>
            );
            continue;
        }

        flushList();
        blocks.push(
            <p key={`p-${key++}`} style={PARAGRAPH_STYLE}>
                {renderInline(line, `p-${key}`)}
            </p>
        );
    }

    flushList();
    return blocks;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function DocumentPreview({ name, onClose }) {
    const [doc, setDoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const dialogRef = useRef(null);
    const restoreFocusRef = useRef(null);

    // Fetch on mount and whenever the target filename changes. The flag and the
    // signal both drop results that arrive after a switch or an unmount.
    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        if (!name) {
            setDoc(null);
            setError('');
            setLoading(false);
            return () => {
                cancelled = true;
                controller.abort();
            };
        }

        setLoading(true);
        setError('');
        setDoc(null);

        requestWithRefresh((headers) =>
            apiClient.get(`/documents/${encodeURIComponent(name)}/`, { headers, signal: controller.signal })
        )
            .then((res) => {
                if (cancelled) return;
                setDoc(res.data);
                setError('');
            })
            .catch((err) => {
                // An aborted request is the expected outcome of a name change or
                // an unmount, not something to report.
                if (cancelled || controller.signal.aborted) return;
                if (err.code === 'ERR_CANCELED') return;
                setError(
                    err.response?.data?.error ||
                    err.message ||
                    'Failed to open document.'
                );
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [name]);

    // Focus moves in on open and goes back where it came from on close.
    useEffect(() => {
        if (!name) return undefined;
        restoreFocusRef.current = document.activeElement;
        dialogRef.current?.focus();
        return () => {
            const target = restoreFocusRef.current;
            restoreFocusRef.current = null;
            if (target && typeof target.focus === 'function') target.focus();
        };
    }, [name]);

    const close = useCallback(() => {
        onClose?.();
    }, [onClose]);

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close();
                return;
            }

            if (event.key !== 'Tab') return;

            // Minimal cycle: wrap at both ends instead of escaping the dialog.
            const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE);
            if (!nodes || nodes.length === 0) {
                event.preventDefault();
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && (active === first || active === dialogRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        },
        [close]
    );

    if (!name) return null;

    const displayName = doc?.name || name;
    const isMarkdown = (doc?.extension || '').toLowerCase() === '.md';
    const content = doc?.content || '';

    return (
        <div
            className="dm-modal-overlay"
            onClick={close}
            onKeyDown={handleKeyDown}
        >
            <div
                ref={dialogRef}
                className="dm-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`Preview of ${displayName}`}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                style={{
                    maxWidth: '56rem',
                    maxHeight: 'min(88dvh, 56rem)',
                    outline: 'none',
                }}
            >
                <div className="dm-modal-header" style={{ gap: 'var(--space-3)' }}>
                    <h3
                        title={displayName}
                        style={{
                            margin: 0,
                            minWidth: 0,
                            flex: '1 1 auto',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            color: 'var(--color-text)',
                        }}
                    >
                        {displayName}
                    </h3>
                    <button
                        type="button"
                        className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon"
                        aria-label="Close preview"
                        onClick={close}
                    >
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>

                <div className="dm-modal-body" style={{ padding: 'var(--space-5)' }}>
                    {loading && (
                        <div
                            role="status"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-3)',
                                color: 'var(--color-text-muted)',
                                fontSize: 'var(--text-sm)',
                            }}
                        >
                            <span className="dm-spinner" aria-hidden="true" />
                            <span>Loading document content...</span>
                        </div>
                    )}

                    {!loading && error && (
                        <p className="dm-error-text">{error}</p>
                    )}

                    {!loading && !error && isMarkdown && (
                        <div style={{ fontFamily: 'var(--font-reading)' }}>
                            {content.trim() ? (
                                renderMarkdown(content)
                            ) : (
                                <p className="dm-help">No text extracted from this document.</p>
                            )}
                        </div>
                    )}

                    {!loading && !error && !isMarkdown && (
                        <pre
                            style={{
                                margin: 0,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 'var(--text-sm)',
                                lineHeight: 'var(--leading-normal)',
                                whiteSpace: 'pre-wrap',
                                overflowWrap: 'anywhere',
                                color: 'var(--color-text)',
                            }}
                        >
                            {content.trim()
                                ? content
                                : 'No text extracted from this document.'}
                        </pre>
                    )}

                    {!loading && !error && doc?.truncated && (
                        <p className="dm-help" style={{ marginBottom: 0 }}>
                            Showing the first {content.length.toLocaleString()} of{' '}
                            {(doc.total_characters ?? content.length).toLocaleString()} characters.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DocumentPreview;