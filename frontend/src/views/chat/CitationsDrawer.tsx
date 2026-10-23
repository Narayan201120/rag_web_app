import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { CitationsResponse } from '../../types';
import { Drawer } from '../../components/Drawer';

interface CitationsDrawerProps {
  chatId: number | null;
  focusCite: number | null;
  onClose: () => void;
}

export function CitationsDrawer({ chatId, focusCite, onClose }: CitationsDrawerProps) {
  const [data, setData] = useState<CitationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (chatId === null) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.chat
      .citations(chatId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  return (
    <Drawer
      open={chatId !== null}
      onClose={onClose}
      title="Citations"
      sub={
        data
          ? `${data.citations.length} ${data.citations.length === 1 ? 'passage' : 'passages'} behind this answer`
          : undefined
      }
    >
      {loading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--moss)' }}>
          <span className="spinner" /> Loading citations…
        </div>
      )}
      {error && (
        <div className="msg-error" role="alert">
          {error}
        </div>
      )}
      {data && (
        <>
          <p
            className="quote"
            style={{ marginBottom: 18, fontStyle: 'italic' }}
          >
            {data.question}
          </p>
          {data.citations.map((cite) => (
            <div
              key={cite.index}
              className="cite-item"
              style={
                focusCite === cite.index
                  ? { background: 'var(--pine-wash)', borderRadius: 12, padding: 12 }
                  : undefined
              }
            >
              <div className="cite-head">
                <span className="cite-num">{cite.index}</span>
                <span className={`cite-src${cite.available ? '' : ' missing'}`}>{cite.source}</span>
              </div>
              <div className="quote">{cite.text}</div>
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
}
