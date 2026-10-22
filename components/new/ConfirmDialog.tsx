import React from 'react';
import { RpDialog } from './RpDialog';
import { dialogButton } from './dialogButton';
import HoldButton from '../kokonutui/hold-button';
import type { ConfirmRequest } from '../../services/confirm';

/** One confirmation, drawn as an RpDialog (loaded on the first confirm by components/ConfirmHost.tsx). */
const ConfirmDialog: React.FC<{ open: boolean; request: ConfirmRequest; onSettle: (ok: boolean) => void }> = ({ open, request, onSettle }) => {
  const danger = !!request.danger;
  const hold = request.hold ?? danger;
  const confirmLabel = request.confirmLabel || 'Confirm';
  const holdLabel = /^hold\b/i.test(confirmLabel) ? confirmLabel : `Hold to ${confirmLabel.charAt(0).toLowerCase()}${confirmLabel.slice(1)}`;
  const lines = Math.ceil(request.message.length / 40);
  return (
    <RpDialog
      open={open}
      onClose={() => onSettle(false)}
      title={request.title || (danger ? 'Are you sure?' : 'Please confirm')}
      description={request.message}
      tone={danger ? 'danger' : 'default'}
      role="alertdialog"
      peekHeight={(hold ? 210 : 162) + lines * 20}
      actions={(
        <>
          <button type="button" data-autofocus={danger ? '' : undefined} onClick={() => onSettle(false)} className={dialogButton('ghost')}>
            {request.cancelLabel || 'Cancel'}
          </button>
          {hold ? (
            <HoldButton variant="danger" resetAfter={0} completeLabel="Done" onHoldComplete={() => onSettle(true)}>{holdLabel}</HoldButton>
          ) : (
            <button type="button" data-autofocus={danger ? undefined : ''} onClick={() => onSettle(true)} className={dialogButton('primary')}>
              {confirmLabel}
            </button>
          )}
        </>
      )}
    />
  );
};

export default ConfirmDialog;
