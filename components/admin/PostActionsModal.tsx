'use client';

import { Button, Input, Modal, Text } from '@/components/ui';
import { isExactBulkConfirmation } from '@/lib/api/adminMutations';

import type { PostActions } from './usePostActions';

/** The confirmation dialog for deleting one post or publishing every draft. */
export function PostActionsModal({ actions }: { actions: PostActions }) {
  const {
    confirmation,
    bulkConfirmationText,
    setBulkConfirmationText,
    isConfirming,
  } = actions;

  return (
    <Modal
      isOpen={confirmation !== null}
      onClose={actions.cancel}
      title={
        confirmation?.kind === 'delete'
          ? 'Eliminar article'
          : 'Publicar tots els esborranys'
      }
      closeOnBackdropClick={!isConfirming}
      showCloseButton={!isConfirming}
      footer={
        confirmation ? (
          <>
            <Button
              variant="ghost"
              disabled={isConfirming}
              onClick={actions.cancel}
            >
              Cancel·lar
            </Button>
            <Button
              variant={
                confirmation.kind === 'delete' ? 'destructive' : 'primary'
              }
              loading={isConfirming}
              disabled={
                confirmation.kind === 'bulk' &&
                !isExactBulkConfirmation(
                  bulkConfirmationText,
                  confirmation.count
                )
              }
              onClick={actions.confirm}
            >
              {confirmation.kind === 'delete'
                ? 'Eliminar 1 article'
                : `Publicar ${confirmation.count} article(s)`}
            </Button>
          </>
        ) : null
      }
    >
      {confirmation?.kind === 'delete' ? (
        <div className="space-y-3">
          <Text>
            Eliminaràs definitivament 1 article:{' '}
            <strong>
              {confirmation.post.titles.ca || confirmation.post.titles.en}
            </strong>
            .
          </Text>
          <Text variant="small" className="text-subtle">
            Si una imatge no es pot netejar al primer intent, es repetirà
            l’operació amb la mateixa clau segura.
          </Text>
        </div>
      ) : confirmation?.kind === 'bulk' ? (
        <div className="space-y-3">
          <Text>
            Aquesta acció publicarà exactament{' '}
            <strong>{confirmation.count} article(s)</strong> que ara són
            esborranys.
          </Text>
          <Text variant="small" className="text-subtle">
            Els articles importats no canvien d’estat fins que confirmis
            explícitament aquesta operació.
          </Text>
          <div className="border-l-2 border-warning/30 bg-warning/5 px-4 py-3">
            <Input
              id="bulk-publication-count"
              label={`Escriu ${confirmation.count} per confirmar`}
              value={bulkConfirmationText}
              onChange={event => setBulkConfirmationText(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-describedby="bulk-publication-help"
              isInvalid={
                bulkConfirmationText.length > 0 &&
                !isExactBulkConfirmation(
                  bulkConfirmationText,
                  confirmation.count
                )
              }
              className="font-mono tabular-nums"
            />
            <div id="bulk-publication-help">
              <Text variant="small" className="mt-2 text-body">
                El recompte queda vinculat a aquesta operació. Si canvia abans
                d’executar-la, no es publicarà cap esborrany.
              </Text>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
