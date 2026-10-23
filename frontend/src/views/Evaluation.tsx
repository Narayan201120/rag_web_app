import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { EvalResult, HardQuery } from '../types';
import { useToast } from '../state/toast';
import { Icon } from '../components/Icon';
import { formatWhen } from '../lib/format';

const FAILURE_LABELS: Record<string, string> = {
  bad_retrieval: 'Missed the right passage',
  hallucination: 'Answer not in documents',
  incomplete: 'Cut off or incomplete',
  other: 'Something else',
};

export function Evaluation() {
  const toast = useToast();

  const [numQuestions, setNumQuestions] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [flags, setFlags] = useState<HardQuery[]>([]);

  const loadResults = useCallback(async () => {
    try {
      const res = await api.evaluate.results();
      setResults(res.results);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not load results.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void loadResults();
    api.evaluate
      .hardQueries()
      .then((res) => setFlags(res.hard_queries))
      .catch(() => setFlags([]));
  }, [loadResults]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await api.evaluate.generate(numQuestions);
      toast.push(res.message, 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  }, [numQuestions, toast]);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const res = await api.evaluate.run();
      toast.push(res.message, 'success');
      await loadResults();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Evaluation failed.', 'error');
    } finally {
      setRunning(false);
    }
  }, [loadResults, toast]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Evaluation</h1>
          <p className="page-sub">
            Measure how well retrieval and generation hold up, and revisit the answers users
            flagged.
          </p>
        </div>
      </div>

      <div className="eval-grid">
        <div className="panel">
          <h2>Generate a dataset</h2>
          <p className="panel-sub">
            The saved model writes {numQuestions} questions from your indexed documents. This is the
            test set the evaluation runs on.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="eval-num">Questions to generate</label>
              <input
                id="eval-num"
                className="input"
                type="number"
                min={1}
                max={20}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? <span className="spinner" /> : <Icon name="plus" size={15} />}
              Generate questions
            </button>
          </div>
        </div>

        <div className="panel">
          <h2>Run the evaluation</h2>
          <p className="panel-sub">
            Scores the latest dataset items on faithfulness, answer relevancy, and context
            relevancy. This makes several model calls and can take a minute.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run()}
            disabled={running}
          >
            {running ? <span className="spinner on-dark" /> : <Icon name="flask" size={15} />}
            Run evaluation
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div style={{ padding: '20px 24px 0' }}>
          <h2>Latest results</h2>
          <p className="panel-sub">The twenty most recent scored questions.</p>
        </div>
        {results === null ? (
          <div style={{ padding: '0 24px 24px', color: 'var(--moss)', display: 'flex', gap: 10 }}>
            <span className="spinner" /> Loading results…
          </div>
        ) : results.length === 0 ? (
          <div className="empty">
            <h3>No results yet</h3>
            <p>Generate a dataset, then run the evaluation to see scores here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Scores</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr key={result.id ?? i}>
                    <td>
                      <div className="eval-q">{result.question}</div>
                      {result.error && <div className="eval-err">{result.error}</div>}
                      {result.actual_answer && (
                        <div className="muted small" style={{ marginTop: 4 }}>
                          {result.actual_answer.slice(0, 120)}
                          {result.actual_answer.length > 120 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <ScoreCells result={result} />
                    </td>
                    <td className="muted">{formatWhen(result.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 0, marginTop: 16 }}>
        <div style={{ padding: '20px 24px 0' }}>
          <h2>Flagged answers</h2>
          <p className="panel-sub">
            Thumbs-down feedback from chat, newest first. These are the cases worth fixing first.
          </p>
        </div>
        {flags.length === 0 ? (
          <div className="empty">
            <h3>Nothing flagged</h3>
            <p>When an answer misses, use the thumbs-down control in chat. It lands here.</p>
          </div>
        ) : (
          <div style={{ padding: '8px 24px 18px' }}>
            {flags.map((flag) => (
              <div key={flag.chat_id} className="flag-item">
                <span className="q">{flag.question}</span>
                <span className="a">{flag.answer}</span>
                <div className="flag-meta">
                  {flag.failure_tag && (
                    <span className="tag tag-off">{FAILURE_LABELS[flag.failure_tag] ?? flag.failure_tag}</span>
                  )}
                  {flag.comment && <span className="small muted">“{flag.comment}”</span>}
                  <span className="small muted">{formatWhen(flag.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCells({ result }: { result: EvalResult }) {
  const rows: { label: string; value: number | undefined }[] = [
    { label: 'Faithfulness', value: result.faithfulness },
    {
      label: 'Answer relevancy',
      value: result.answer_relevancy ?? result.answer_relevance,
    },
    { label: 'Context relevancy', value: result.context_relevancy },
  ];
  return (
    <div className="score-cells">
      {rows.map((row) => (
        <div key={row.label} className="scorebar">
          <span className="lbl">{row.label}</span>
          <span className="track">
            <span
              className="fill"
              style={{
                width: row.value !== undefined ? `${Math.round(row.value * 100)}%` : '0%',
                background: row.value === undefined ? 'var(--line-strong)' : undefined,
              }}
            />
          </span>
          <span className="val">
            {row.value !== undefined ? row.value.toFixed(2) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
