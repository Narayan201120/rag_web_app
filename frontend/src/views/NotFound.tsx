import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="empty" style={{ minHeight: '100vh', display: 'grid', alignContent: 'center' }}>
      <h3>This page is not in the index.</h3>
      <p>The address does not match anything in DocuMind.</p>
      <div>
        <Link className="btn btn-primary" to="/chat">
          Back to chat
        </Link>
      </div>
    </div>
  );
}
