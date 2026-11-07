import React, { useState } from 'react';
import { apiUrl } from '../api';

const initialsOf = (name) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'S';

// Uploaded photo, or the student's initials when there is none or it fails to load.
export default function ProfilePhoto({ url, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  const usable = url && !url.endsWith('/default_student.png') && !failed;
  if (!usable) {
    return <span className={`profile-photo profile-photo--initials ${className}`} role="img" aria-label={name}>{initialsOf(name)}</span>;
  }
  return <img className={`profile-photo ${className}`} src={apiUrl(url)} alt={name} onError={() => setFailed(true)} />;
}
