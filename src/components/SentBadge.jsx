import { Check } from 'lucide-react';

// Marks a comment the agent already received; it stays for reference and is
// not part of the next send unless edited
export default function SentBadge() {
  return (
    <span className="comment-sent-badge" title="Already sent to the agent">
      <Check size={11} strokeWidth={2} />
      sent
    </span>
  );
}
