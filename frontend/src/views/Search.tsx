import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { SearchHit } from '../types';
import { Icon } from '../components/Icon';
import { useToast } from '../state/toast';

const TOP_K_CHOICES = [3, 5, 10];

export function SearchView() {
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(3);
  const [rerank, setRerank] = useState(false);
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [ranQuery, setRanQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 3) {
      setSuggestions([]);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await api.search.suggest(needle);
        setSuggestions(res.suggestions.slice(0, 5));
      } catch {
        setSuggestions([]);
      }
    }, 220);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const needle = rawQuery.trim();
      if (!needle || busy) return;
      setSuggestOpen(false);
      setBusy(true);
      setRanQuery(needle);
      try {
        const res = rerank
          ? await api.search.rerank(needle, 10, topK)
          : await api.search.query(needle, topK);
        setResults(res.results);
        if (res.results.length === 0) {
          toast.push('Nothing in your index matches that query.', 'info');
        }
      } catch (err) {
        toast.push(err instanceof Error ? err.message : 'Search failed.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [busy, rerank, topK, toast],
  );

  /** Split chunk text into plain runs and <mark>ed query terms. */
  const highlight = useMemo(() => {
    const terms = ranQuery
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter((term) => term.length >= 3);
    const regex = terms.length > 0 ? new RegExp(`(${terms.join('|')})`, 'gi') : null;
    return (text: string) => {
      if (!regex) return text;
      // split with a capturing group: odd indices are the matched terms
      return text.split(regex).map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : part,
      );
    };
  }, [ranQuery]);

  return (
    <div className="search-wrap">
      <div className="search-hero">
        <h1>Search your documents</h1>
        <div className="search-box" ref={boxRef}>
          <input
            className="search-input"
            placeholder="Type a phrase you half-remember…"
            aria-label="Search query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch(query);
              if (e.key === 'Escape') setSuggestOpen(false);
            }}
            autoFocus
          />
          {suggestOpen && suggestions.length > 0 && !busy && (
            <div className="suggest-pop">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuery(suggestion);
                    void runSearch(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="search-controls">
          <span className="ctl">
            Show
            <select
              className="input"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              aria-label="Number of results"
            >
              {TOP_K_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
            passages
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={rerank}
              onChange={(e) => setRerank(e.target.checked)}
            />
            <span className="track" aria-hidden="true" />
            Rerank with the cross-encoder
          </label>
        </div>

        <div className="search-btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runSearch(query)}
            disabled={!query.trim() || busy}
          >
            {busy ? <span className="spinner on-dark" /> : <Icon name="search" size={15} />}
            Search
          </button>
        </div>
      </div>

      {results !== null && (
        <div className="results">
          <div className="results-head">
            <span>
              {results.length} {results.length === 1 ? 'passage' : 'passages'} for “{ranQuery}”
            </span>
            <span>{rerank ? 'cross-encoder reranked' : 'hybrid retrieval'}</span>
          </div>
          {results.length === 0 && (
            <div className="empty">
              <h3>No matches in your index</h3>
              <p>Try different wording, or check that the document containing this is uploaded and indexed.</p>
            </div>
          )}
          {results.map((hit, index) => (
            <div key={`${hit.source}-${index}`} className="hit">
              <div className="hit-head">
                <span className="hit-rank">[{index + 1}]</span>
                <span className="hit-src">{hit.source}</span>
                {rerank && hit.relevance_score !== undefined && (
                  <span className="hit-score">
                    <span className="track">
                      <span
                        className="fill"
                        style={{ width: `${Math.round(hit.relevance_score * 100)}%` }}
                      />
                    </span>
                    <span className="val">{hit.relevance_score.toFixed(3)}</span>
                  </span>
                )}
              </div>
              <p className="hit-text">{highlight(hit.chunk)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
