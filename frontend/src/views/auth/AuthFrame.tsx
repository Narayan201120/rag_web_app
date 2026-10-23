import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';

/**
 * Shared auth layout: dark reference-desk panel with the retrieval motif,
 * form column on paper.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-side">
        <Link to="/login" className="auth-brand" style={{ textDecoration: 'none' }}>
          <Logo size={26} />
          <span className="brand-name">DocuMind</span>
        </Link>

        <div>
          <p className="auth-statement">Ask your documents. Get answers you can verify.</p>
          <div className="auth-motif" aria-hidden="true" style={{ marginTop: 40 }}>
            <div className="passage">
              <div className="line w80" />
              <div className="line mark" />
              <div className="line w45" />
            </div>
            <div className="passage">
              <div className="line w60" />
              <div className="line mark" />
            </div>
            <div className="passage">
              <div className="line mark" />
              <div className="line w80" />
            </div>
          </div>
        </div>

        <p className="auth-note">
          Upload a document or a web page, then ask. DocuMind finds the passage that answers you and
          cites it, so every claim traces back to its source.
        </p>
      </div>

      <div className="auth-form-col">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
