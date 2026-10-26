import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { api } from '../lib/api';
import { alertsOn, alertsSupported, disableAlerts, enableAlerts } from '../lib/notify';
import { useToast } from './Toaster';

export function AlertsBell({ account }: { account: string }) {
  const toast = useToast();
  const [on, setOn] = useState(alertsOn);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await disableAlerts();
        setOn(false);
        toast('Alerts off', 'info');
        return;
      }
      const r = await enableAlerts(account);
      if (!r.ok) return toast(r.message ?? 'Could not enable alerts', 'error');
      setOn(true);
      toast(r.push ? 'Alerts on, even with the tab closed' : 'Alerts on while this tab is open (add VAPID keys for closed-tab push)', 'info');
      await api.pushTest(account).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (!alertsSupported()) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Turn alerts off' : 'Turn alerts on'}
      title={on ? 'Alerts on' : 'Turn on browser alerts'}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors cursor-pointer ${
        on ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line-strong bg-tint text-ink-3 hover:text-ink'
      }`}
    >
      {on ? <Bell size={16} /> : <BellOff size={16} />}
    </button>
  );
}
