'use client';

import { Camera } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Feedback } from './feedback';

export function CameraScanner({ onScan, onClose }: {
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
        const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
        if (closed) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (closed) { stop(); return; }
        const reader = new BrowserMultiFormatOneDReader();
        controls = await reader.decodeFromStream(stream, preview, (result, _error, activeControls) => {
          if (closed || !result) return;
          const value = result.getText();
          if (scan.current(value)) {
            closed = true;
            activeControls.stop();
            stop();
          } else {
            setMessage('Scan an EAN or UPC product barcode.');
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
  }, []);

  const label = 'Scan product barcode';
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
