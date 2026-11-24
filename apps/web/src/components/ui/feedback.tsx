import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

type FeedbackProps = {
  children: ReactNode;
  tone?: 'info' | 'success' | 'error';
  onDismiss?: () => void;
  action?: ReactNode;
  toast?: boolean;
};

export function Feedback({ children, tone = 'info', onDismiss, action, toast }: FeedbackProps) {
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info;
  return (
    <div className={`ui-feedback ui-feedback--${tone}${toast ? ' ui-feedback--toast' : ''}`}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <div className="ui-feedback-message" role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
      {action}
      {onDismiss && <button type="button" className="ui-feedback-dismiss" onClick={onDismiss} aria-label="Dismiss message"><X size={16} aria-hidden="true" /></button>}
    </div>
  );
}
