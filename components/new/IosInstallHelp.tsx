import React from 'react';
import { RpDialog } from './RpDialog';
import { dialogButton } from './dialogButton';
import { CheckCircle, DeviceMobile, Export, PlusSquare, type Icon } from '../ui/hugeicons';

const STEPS: { icon: Icon; title: string; text: string }[] = [
  { icon: Export, title: 'Tap Share', text: 'In Safari, tap the Share icon in the toolbar.' },
  { icon: PlusSquare, title: 'Add to Home Screen', text: 'Scroll down and choose Add to Home Screen.' },
  { icon: CheckCircle, title: 'Tap Add', text: 'WanderGrid then opens full screen from your home screen.' },
];

/** How to install on iPhone and iPad, where Safari has no install prompt (loaded when first needed by PWAInstallBanner). */
const IosInstallHelp: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <RpDialog
    open={open}
    onClose={onClose}
    title="Install on iPhone or iPad"
    icon={DeviceMobile}
    peekHeight={170}
    actions={<button type="button" data-autofocus onClick={onClose} className={dialogButton('primary')}>Got it</button>}
  >
    <ol className="flex flex-col gap-2">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex items-start gap-3 rounded-rp-inset bg-rp-inset p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rp-surface text-rp-ink" aria-hidden><step.icon size={18} /></span>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-rp-ink">{i + 1}. {step.title}</span>
            <span className="text-sm text-rp-muted">{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  </RpDialog>
);

export default IosInstallHelp;
