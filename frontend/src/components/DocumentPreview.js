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
 *   size_bytes and uploaded_at are optional: older payloads omit them and the
 *   header simply leaves those items out.
 * Errors arrive as { error: '...' }.
 *
 * Every visual value lives in styles/document-preview.css. Nothing here carries
 * a style prop, so the reading layout can change without touching this file.
 */

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// A fence opener, with or without a language tag after the backticks.
const FENCE_PATTERN = /^```(.*)$/;

/* The two inline shapes this reader knows. Both render as a mono pill.
 *
 * `$...$` and `$$...$$` are not formulas here on purpose: no math engine is
 * loaded, so a raw expression stays code and nobody mistakes it for prose. A
 * lone `$` with no partner is left alone and reads as ordinary text. */
const INLINE_PATTERN = /(`[^`\n]+`|\$\$[^$\n]+\$\$|\$[^$\n]+\$)/g;

function renderInline(text, keyPrefix) {
    // A capturing group keeps the matched delimiters in the split result, so
    // every chunk is either a whole token or a run of plain text.
    return String(text)
        .split(INLINE_PATTERN)
        .filter((chunk) => chunk !== '' && chunk !== undefined)
        .map((chunk, i) => {
            if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
                return (
                    <code key={`${keyPrefix}-c${i}`} className="doc-preview-code-inline">
                        {chunk.slice(1, -1)}
                    </code>
                );
            }
            if (chunk.startsWith('$')) {
                return (
                    <code key={`${keyPrefix}-m${i}`} className="doc-preview-code-inline">
                        {chunk}
                    </code>
                );
            }
            return <span key={`${keyPrefix}-t${i}`}>{chunk}</span>;
        });
}

/* A deliberately small markdown reader: headings, paragraphs, ordered and
 * unordered lists, blockquotes, fenced code, and inline code or math as a mono
 * pill. Enough to read a note without a parser dependency. */
function renderMarkdown(content) {
    const text = String(content || '');
    const blocks = [];
    let listItems = { items: [], startIndex: 1 };
    let listType = null;
    let codeFence = null;
    let key = 0;

    const flushList = () => {
        if (!listItems.items.length) return;
        const Tag = listType === 'ol' ? 'ol' : 'ul';
        const start = listType === 'ol' ? listItems.startIndex : null;
        blocks.push(
            <Tag key={`list-${key++}`} start={start || undefined}>
                {listItems.items.map((item, i) => (
                    <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
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

    const flushCode = () => {
        if (!codeFence) return;
        const { lang, lines } = codeFence;
        blocks.push(
            <div key={`code-${key++}`} className="doc-preview-code">
                {lang && (
                    <div className="doc-preview-code-bar">
                        <span className="doc-preview-code-lang">{lang}</span>
                    </div>
                )}
                <pre>
                    <code className="doc-preview-code-body">{lines.join('\n')}</code>
                </pre>
            </div>
        );
        codeFence = null;
    };

    for (const raw of text.split('\n')) {
        const line = raw.trim();

        // Fences flip the parser in and out of literal mode. The second fence
        // closes whatever the first opened.
        const fence = line.match(FENCE_PATTERN);
        if (fence) {
            if (codeFence) {
                flushCode();
            } else {
                flushList();
                codeFence = { lang: fence[1].trim().slice(0, 24), lines: [] };
            }
            continue;
        }

        // Inside a fence every line is code, blank lines and indent included,
        // so nothing else in this loop gets a look at it.
        if (codeFence) {
            codeFence.lines.push(raw);
            continue;
        }

        if (!line) {
            flushList();
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushList();
            const level = Math.min(heading[1].length, 6);
            const Tag = HEADING_TAGS[level - 1];
            blocks.push(<Tag key={`h-${key++}`}>{renderInline(heading[2], `h-${key}`)}</Tag>);
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
                <blockquote key={`bq-${key++}`}>
                    {renderInline(quote[1], `bq-${key}`)}
                </blockquote>
            );
            continue;
        }

        flushList();
        blocks.push(<p key={`p-${key++}`}>{renderInline(line, `p-${key}`)}</p>);
    }

    // An unterminated fence still renders its lines rather than dropping them.
    flushCode();
    flushList();
    return blocks;
}

/* Header metadata. Each of these returns an empty string when the payload
 * leaves the field out, and the caller drops empty items rather than rendering
 * a blank or a NaN. */
function fileTypeLabel(extension, name) {
    const raw = String(extension || '').trim() || (String(name).match(/\.[^.]+$/) || [''])[0];
    const clean = raw.replace(/^\./, '').trim();
    return clean ? clean.toUpperCase().slice(0, 8) : '';
}

function formatSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
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

    const typeLabel = fileTypeLabel(doc?.extension, displayName);
    const sizeLabel = formatSize(doc?.size_bytes);
    const dateLabel = formatDate(doc?.uploaded_at);
    const hasMeta = Boolean(typeLabel || sizeLabel || dateLabel);

    return (
        <div
            className="dm-modal-overlay"
            onClick={close}
            onKeyDown={handleKeyDown}
        >
            <div
                ref={dialogRef}
                className="dm-modal doc-preview-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`Preview of ${displayName}`}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="dm-modal-header doc-preview-header">
                    <div className="doc-preview-header-main">
                        <h3 className="doc-preview-name" title={displayName}>
                            {displayName}
                        </h3>
                        {hasMeta && (
                            <div className="doc-preview-meta">
                                {typeLabel && (
                                    <span className="dm-badge doc-preview-badge">{typeLabel}</span>
                                )}
                                {sizeLabel && (
                                    <span className="doc-preview-meta-item">{sizeLabel}</span>
                                )}
                                {dateLabel && (
                                    <span className="doc-preview-meta-item">{dateLabel}</span>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon doc-preview-close"
                        aria-label="Close preview"
                        onClick={close}
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="dm-modal-body doc-preview-body">
                    {loading && (
                        <div className="doc-preview-loading" role="status">
                            <div className="doc-preview-loading-head">
                                <span className="dm-spinner" aria-hidden="true" />
                                <span>Loading document content...</span>
                            </div>
                            <div className="doc-preview-skeleton" aria-hidden="true">
                                <span className="dm-skeleton doc-preview-skeleton-line" />
                                <span className="dm-skeleton doc-preview-skeleton-line" />
                                <span className="dm-skeleton doc-preview-skeleton-line" />
                            </div>
                        </div>
                    )}

                    {!loading && error && (
                        <p className="dm-error-text doc-preview-error">{error}</p>
                    )}

                    {!loading && !error && isMarkdown && (
                        <div className="doc-preview-reading">
                            {content.trim() ? (
                                renderMarkdown(content)
                            ) : (
                                <p className="dm-help doc-preview-empty">
                                    No text extracted from this document.
                                </p>
                            )}
                        </div>
                    )}

                    {!loading && !error && !isMarkdown && (
                        <div className="doc-preview-reading">
                            <pre className="doc-preview-plain">
                                {content.trim()
                                    ? content
                                    : 'No text extracted from this document.'}
                            </pre>
                        </div>
                    )}
                </div>

                {!loading && !error && doc?.truncated && (
                    <div className="doc-preview-footer">
                        <p className="dm-help doc-preview-footer-text">
                            Showing the first {content.length.toLocaleString()} of{' '}
                            {(doc.total_characters ?? content.length).toLocaleString()} characters.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default DocumentPreview;