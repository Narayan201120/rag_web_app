import { useState } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Search() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('search');
    const token = localStorage.getItem('access');
    const headers = { Authorization: `Bearer ${token}` };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        const endpoint = mode === 'rerank' ? '/search/rerank/' : '/search/';
        try {
            const res = await axios.post(`${API}${endpoint}`, { query }, { headers });
            setResults(res.data.results || []);
        } catch (err) {
            alert('Search failed');
        }
        setLoading(false);
    };

    const handleSuggest = async (value) => {
        setQuery(value);
        if (value.length < 2) {
            setSuggestions([]);
            return;
        }
        try {
            const res = await axios.get(`${API}/search/suggest/?q=${value}`, { headers });
            setSuggestions(res.data.suggestions || []);
        } catch (err) {
            setSuggestions([]);
        }
    };

    return (
        <div className="search-container">
            <h2>Search Documents</h2>
            <div className="search-modes">
                <button className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>Fast Search</button>
                <button className={mode === 'rerank' ? 'active' : ''} onClick={() => setMode('rerank')}>Reranked Search</button>
            </div>
            <form onSubmit={handleSearch}>
                <input
                    type="text"
                    placeholder="Search your documents..."
                    value={query}
                    onChange={(e) => handleSuggest(e.target.value)}
                />
                <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
            </form>
            {suggestions.length > 0 && (
                <div className="suggestions">
                    {suggestions.map((s, i) => (
                        <div key={i} className="suggestion" onClick={() => { setQuery(s); setSuggestions([]); }}>{s}</div>
                    ))}
                </div>
            )}
            <div className="results">
                {results.map((r, i) => (
                    <div key={i} className="result">
                        <p>{r.chunk || r}</p>
                        {r.source && <span className="source">Source: {r.source}</span>}
                        {r.relevance_score && <span className="score">Score: {r.relevance_score}</span>}
                    </div>
                ))}
                {results.length === 0 && !loading && query && (
                    <p style={{ fontSize: '0.8125rem', color: '#6A6B75', marginTop: '16px' }}>No matches found.</p>
                )}
            </div>
        </div>
    );
}

export default Search;
