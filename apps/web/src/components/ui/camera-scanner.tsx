'use client';

import { Camera } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { SETTINGS_STORAGE_PREFIX } from '@/components/settings/types';
import { Feedback } from './feedback';

export function CameraScanner({ kind, onScan, onClose }: {
  kind: 'qr' | 'barcode';
  onScan: (value: string) => boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scan = useRef(onScan);
  const titleId = useId();
  const [message, setMessage] = useState('');
  scan.current = onScan;
  useEffect(() => {
    const element = dialog.current;
    const preview = video.current;
    if (!element || !preview) return;
    element.showModal();

    let closed = false;
    let stream: MediaStream | undefined;
    let controls: { stop: () => void } | undefined;
    const stop = () => {
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      preview.srcObject = null;
    };

    async function start(preview: HTMLVideoElement) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setMessage('Camera access needs HTTPS and a browser with camera support.');
          return;
        }
        const { BrowserQRCodeReader, BrowserMultiFormatOneDReader } = await import('@zxing/browser');
        if (closed) return;
        let facingMode = 'environment';
        if (kind === 'qr') {
          try {
            const role = getStoredSession()?.user.role;
            const saved = role && localStorage.getItem(SETTINGS_STORAGE_PREFIX + role);
            if (saved && JSON.parse(saved).qrCameraFacing === 'user') facingMode = 'user';
          } catch { /* Use the rear camera when preferences are unavailable. */ }
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: false });
        if (closed) { stop(); return; }
        const reader = kind === 'qr' ? new BrowserQRCodeReader() : new BrowserMultiFormatOneDReader();
        controls = await reader.decodeFromStream(stream, preview, (result, _error, activeControls) => {
          if (closed || !result) return;
          const value = result.getText();
          if (scan.current(value)) {
            closed = true;
            activeControls.stop();
            stop();
          } else {
            setMessage(kind === 'qr' ? 'Scan the attendance QR displayed at your location.' : 'Scan an EAN or UPC product barcode.');
          }
        });
        if (closed) stop();
      } catch (error) {
        stop();
        if (!closed) setMessage(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser and try again.'
          : 'Could not start the camera. Check that it is available and try again.');
      }
    }

    void start(preview);
    return () => {
      closed = true;
      stop();
      element.close();
    };
  }, [kind]);

  const label = kind === 'qr' ? 'Scan attendance QR' : 'Scan product barcode';
  return <dialog ref={dialog} className="device-lock camera-scanner" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
    <Camera aria-hidden="true" size={24} />
    <h2 id={titleId}>{label}</h2>
    <p>Center the code in the camera view.</p>
    <video ref={video} autoPlay muted playsInline aria-label="Camera preview" />
    {message && <Feedback>{message}</Feedback>}
    <div className="device-lock-actions"><button className="admin-secondary" type="button" onClick={onClose}>Close camera</button></div>
  </dialog>;
}
