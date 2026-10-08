import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';
import DocumentPreview from './DocumentPreview';

const SUGGEST_DEBOUNCE_MS = 200;
const MIN_SUGGEST_CHARS = 2;

function ResultCard({ result, onPreview }) {
    const chunk = result.chunk || result;
    const source = result.source || '';
    const score = result.relevance_score;
    const hasScore = score !== null && score !== undefined;
    const scorePct = hasScore ? Math.min(Math.max(score * 100, 0), 100) : 0;

    return (
        <button type="button" className="dm-card dm-card-interactive srch-result" onClick={onPreview}>
            <p className="srch-result-chunk">{chunk}</p>
            <div className="srch-result-meta">
                {source && <span className="dm-badge srch-result-source">{source}</span>}
                {hasScore && (
                    <span className="srch-result-score">
                        <span className="srch-result-score-bar" aria-hidden="true">
                            <span
                                className="srch-result-score-fill"
                                style={{ '--score-pct': `${scorePct}%` }}
                            />
                        </span>
                        <span className="srch-result-score-value">{score.toFixed(4)}</span>
                    </span>
                )}
            </div>
        </button>
    );
}

function Search() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState(() => localStorage.getItem('pref_searchMode') || 'search');
    const [activeIndex, setActiveIndex] = useState(-1);
    const [listboxOpen, setListboxOpen] = useState(false);
    const [searched, setSearched] = useState(false);
    const [previewName, setPreviewName] = useState(null);

    const inputRef = useRef(null);
    const listboxRef = useRef(null);
    const abortControllerRef = useRef(null);
    const debounceRef = useRef(null);
    const requestIdRef = useRef(0);

    // Close listbox on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (inputRef.current && !inputRef.current.contains(e.target)) {
                setListboxOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll active option into view
    useEffect(() => {
        if (activeIndex >= 0 && listboxRef.current) {
            const activeOption = listboxRef.current.children[activeIndex];
            if (activeOption) {
                activeOption.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, []);

    const fetchSuggestions = useCallback(async (value) => {
        const requestId = ++requestIdRef.current;
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const res = await requestWithRefresh((headers) =>
                apiClient.get('/search/suggest/', {
                    headers,
                    params: { q: value },
                    signal: controller.signal,
                })
            );

            if (requestId !== requestIdRef.current) return;

            setSuggestions(res.data.suggestions || []);
            setListboxOpen(true);
            setActiveIndex(-1);
        } catch (err) {
            if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
            if (requestId !== requestIdRef.current) return;
            setSuggestions([]);
            setListboxOpen(false);
        }
    }, []);

    const handleQueryChange = (value) => {
        setQuery(value);
        setSearched(false);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        if (value.trim().length < MIN_SUGGEST_CHARS) {
            setSuggestions([]);
            setListboxOpen(false);
            setActiveIndex(-1);
            return;
        }

        debounceRef.current = setTimeout(() => {
            fetchSuggestions(value.trim());
        }, SUGGEST_DEBOUNCE_MS);
    };

    const selectSuggestion = (suggestion) => {
        setQuery(suggestion);
        setSuggestions([]);
        setListboxOpen(false);
        setActiveIndex(-1);
        setSearched(false);
    };

    const performSearch = async () => {
        const trimmed = query.trim();
        if (!trimmed) return;

        setListboxOpen(false);
        setSuggestions([]);
        setActiveIndex(-1);
        setLoading(true);
        setError('');
        setSearched(true);

        const endpoint = mode === 'rerank' ? '/search/rerank/' : '/search/';
        const payload = { query: trimmed };

        const prefResults = parseInt(localStorage.getItem('pref_results') || '5', 10);
        const safePrefResults = Number.isNaN(prefResults) ? 5 : prefResults;
        if (mode === 'search') {
            payload.top_k = safePrefResults;
        } else {
            payload.final_k = safePrefResults;
        }

        try {
            const res = await requestWithRefresh((headers) => apiClient.post(endpoint, payload, { headers }));
            setResults(res.data.results || []);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Search failed');
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        performSearch();
    };

    const handleModeChange = (newMode) => {
        setMode(newMode);
        localStorage.setItem('pref_searchMode', newMode);
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!listboxOpen && suggestions.length > 0) {
                setListboxOpen(true);
            }
            setActiveIndex((prev) => {
                const next = prev + 1;
                return next >= suggestions.length ? 0 : next;
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => {
                const next = prev - 1;
                return next < 0 ? suggestions.length - 1 : next;
            });
        } else if (e.key === 'Enter') {
            if (listboxOpen && activeIndex >= 0 && suggestions[activeIndex]) {
                e.preventDefault();
                selectSuggestion(suggestions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setListboxOpen(false);
            setActiveIndex(-1);
        } else if (e.key === 'Tab') {
            setListboxOpen(false);
            setActiveIndex(-1);
        }
    };

    // Group results by source filename
    const groupedResults = results.reduce((acc, r) => {
        const source = r.source || 'Unknown';
        if (!acc[source]) acc[source] = [];
        acc[source].push(r);
        return acc;
    }, {});

    const shouldGroup = results.length > 1;

    return (
        <div className="srch-page">
            <header className="srch-header">
                <h2 className="srch-title">Search Documents</h2>
                <p className="srch-subtitle">
                    Find relevant passages across all your uploaded documents using semantic search.
                </p>
            </header>

            <div className="srch-modes" role="radiogroup" aria-label="Search mode">
                <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'search'}
                    className={`srch-mode ${mode === 'search' ? 'srch-mode-active' : ''}`}
                    onClick={() => handleModeChange('search')}
                >
                    <span className="srch-mode-label">Fast</span>
                    <span className="srch-mode-desc">One dense+BM25 pass</span>
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'rerank'}
                    className={`srch-mode ${mode === 'rerank' ? 'srch-mode-active' : ''}`}
                    onClick={() => handleModeChange('rerank')}
                >
                    <span className="srch-mode-label">Reranked</span>
                    <span className="srch-mode-desc">Adds a cross-encoder pass, slower but more precise</span>
                </button>
            </div>

            <form className="srch-form" onSubmit={handleSearch}>
                <div className="srch-input-wrapper" ref={inputRef}>
                    <input
                        type="text"
                        className="dm-input srch-input"
                        placeholder="Search your documents..."
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        role="combobox"
                        aria-expanded={listboxOpen}
                        aria-controls="srch-listbox"
                        aria-activedescendant={activeIndex >= 0 ? `srch-option-${activeIndex}` : undefined}
                        aria-autocomplete="list"
                        aria-label="Search documents"
                    />
                    {listboxOpen && suggestions.length > 0 && (
                        <ul
                            ref={listboxRef}
                            className="srch-listbox"
                            role="listbox"
                            id="srch-listbox"
                            aria-label="Suggestions"
                        >
                            {suggestions.map((s, i) => (
                                <li
                                    key={i}
                                    id={`srch-option-${i}`}
                                    role="option"
                                    aria-selected={i === activeIndex}
                                    className={`srch-option ${i === activeIndex ? 'srch-option-active' : ''}`}
                                    onClick={() => selectSuggestion(s)}
                                    onMouseEnter={() => setActiveIndex(i)}
                                >
                                    {s}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button type="submit" className="dm-btn dm-btn-primary" disabled={loading}>
                    {loading && <span className="dm-spinner" aria-hidden="true" />}
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {error && (
                <div className="srch-error" role="alert">
                    <p className="dm-error-text">{error}</p>
                    <button type="button" className="dm-btn dm-btn-secondary dm-btn-sm" onClick={performSearch}>
                        Retry
                    </button>
                </div>
            )}

            {loading && (
                <div className="srch-skeleton-container" aria-hidden="true">
                    <div className="dm-skeleton srch-skeleton-card" />
                    <div className="dm-skeleton srch-skeleton-card" />
                    <div className="dm-skeleton srch-skeleton-card" />
                </div>
            )}

            {!loading && !error && results.length > 0 && (
                <div className="srch-results">
                    {shouldGroup ? (
                        Object.entries(groupedResults).map(([source, items]) => (
                            <div key={source} className="srch-group">
                                <div className="srch-group-header">
                                    <span className="dm-badge srch-group-badge">{source}</span>
                                    <span className="srch-group-count">
                                        {items.length} result{items.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                {items.map((r, i) => (
                                    <ResultCard key={i} result={r} onPreview={() => setPreviewName(r.source)} />
                                ))}
                            </div>
                        ))
                    ) : (
                        results.map((r, i) => (
                            <ResultCard key={i} result={r} onPreview={() => setPreviewName(r.source)} />
                        ))
                    )}
                </div>
            )}

            {!loading && !searched && (
                <div className="dm-empty-state srch-empty">
                    <div className="dm-empty-state-icon" aria-hidden="true">🔍</div>
                    <div className="dm-empty-state-title">Search your documents</div>
                    <p className="dm-empty-state-body">
                        Find relevant passages across all your uploaded documents. Search works best with
                        specific terms, names, or concepts.
                    </p>
                </div>
            )}

            {!loading && searched && results.length === 0 && !error && (
                <div className="dm-empty-state srch-empty">
                    <div className="dm-empty-state-icon" aria-hidden="true">📭</div>
                    <div className="dm-empty-state-title">No matches found</div>
                    <p className="dm-empty-state-body">
                        Try different wording, broader terms, or check for typos.
                    </p>
                </div>
            )}

            {previewName && <DocumentPreview name={previewName} onClose={() => setPreviewName(null)} />}
        </div>
    );
}

export default Search;
