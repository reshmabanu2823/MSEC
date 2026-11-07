import React from 'react';
import { NetworkError } from '../api.js';
import { Icon } from './Shell/icons';
import './components.css';

// A raw TypeError is what fetch() throws when the network fails, and some screens call fetch directly.
function isNetworkError(error) {
  return error instanceof NetworkError || error instanceof TypeError;
}

export default function ErrorCard({ error, onRetry }) {
  if (isNetworkError(error)) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    // Design screen 07: the offline state replaces the screen's content.
    return (
      <section className="mobile-state offline-state error-card--offline" role="alert">
        <div className="offline-state__icon"><Icon name="wifiOff" size={40} /></div>
        <div>
          <h2>{offline ? "You're offline" : "Can't reach the server"}</h2>
          <p>{offline ? 'Connect to the internet to load this page.' : 'Check your connection and try again.'}</p>
        </div>
        {onRetry && (
          <button type="button" className="state-button" onClick={onRetry}>
            <Icon name="retry" size={18} />Try again
          </button>
        )}
      </section>
    );
  }
  return (
    <div className="card error-card" role="alert">
      <div className="error-card__row">
        <span className="error-card__icon" aria-hidden="true"><Icon name="alert" size={20} /></span>
        <p>{error?.message || 'Something went wrong.'}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
