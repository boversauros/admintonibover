'use client';

import { useState } from 'react';

import { Button, Modal, Text } from '@/components/ui';

export type SaveConflict = {
  message: string;
  recovery: string;
  requestId?: string;
};

interface SaveConflictModalProps {
  conflict: SaveConflict | null;
  onClose: () => void;
  onReload: () => void;
  onCopyFailed: () => void;
}

export function SaveConflictModal({
  conflict,
  onClose,
  onReload,
  onCopyFailed,
}: SaveConflictModalProps) {
  const [copiedRecovery, setCopiedRecovery] = useState<string | null>(null);
  const copied = conflict !== null && copiedRecovery === conflict.recovery;

  const handleCopy = async () => {
    if (!conflict) return;
    try {
      await navigator.clipboard.writeText(conflict.recovery);
      setCopiedRecovery(conflict.recovery);
    } catch {
      onCopyFailed();
    }
  };

  return (
    <Modal
      isOpen={conflict !== null}
      onClose={onClose}
      title="Hi ha una versió més recent"
      closeOnBackdropClick={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Continuar revisant
          </Button>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? 'Dades copiades' : 'Copiar les meves dades'}
          </Button>
          <Button variant="primary" onClick={onReload}>
            Recarregar versió actual
          </Button>
        </>
      }
    >
      {conflict ? (
        <div className="space-y-4">
          <Text>{conflict.message}</Text>
          {conflict.requestId ? (
            <Text variant="small" className="text-subtle">
              Correlació: {conflict.requestId}
            </Text>
          ) : null}
          <div className="space-y-2">
            <label
              htmlFor="conflict-recovery"
              className="block text-xs uppercase tracking-wider text-muted"
            >
              Còpia de recuperació
            </label>
            <textarea
              id="conflict-recovery"
              readOnly
              value={conflict.recovery}
              className="min-h-40 w-full resize-y border border-default bg-background p-3 font-mono text-xs text-body"
              onFocus={event => event.currentTarget.select()}
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
