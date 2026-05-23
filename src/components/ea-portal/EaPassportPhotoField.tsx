'use client';

import { useId, useRef, useState } from 'react';
import { processPassportPhotoFile } from '@/lib/passport-photo-red-bg';

type Props = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
};

export function EaPassportPhotoField({ value, onChange, disabled }: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [localErr, setLocalErr] = useState('');

  const pickFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    setLocalErr('');
    setStatus('');
    setBusy(true);
    try {
      const dataUrl = await processPassportPhotoFile(file, (msg) => setStatus(msg));
      onChange(dataUrl);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Could not process photo.');
      onChange(null);
    } finally {
      setBusy(false);
      setStatus('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="ea-passport-photo-field">
      <div className="ea-passport-photo-preview" aria-hidden={!value}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Passport preview with red background" />
        ) : (
          <span className="ea-passport-photo-placeholder">
            {busy ? status || 'Processing…' : 'No photo'}
          </span>
        )}
      </div>
      <div className="ea-passport-photo-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? status || 'Removing background…' : value ? 'Replace photo' : 'Add passport photo'}
        </button>
        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="ea-passport-photo-input"
          disabled={disabled || busy}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        {value ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || busy}
            onClick={() => {
              setLocalErr('');
              onChange(null);
            }}
          >
            Remove
          </button>
        ) : null}
        <p className="ea-passport-photo-hint">
          Upload any portrait — the system removes the background automatically and places the
          subject on solid passport red. First upload may take a minute while the AI model loads.
        </p>
        {localErr ? <p className="ea-passport-photo-err">{localErr}</p> : null}
      </div>
    </div>
  );
}
