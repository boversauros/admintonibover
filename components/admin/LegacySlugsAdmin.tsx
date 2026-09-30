'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { canManageCognitoUsers } from '@/lib/auth/cognito/groups';
import { getAdminCategories } from '@/lib/api/adminReads';
import {
  applyLegacySlugRow,
  legacyRedirects,
  legacySlugDependencies,
  scanLegacySlugs,
  type LegacySlugOutcome,
  type LegacySlugRow,
} from '@/lib/api/legacySlugs';
import { Button, Heading, Icon, Modal, Text } from '@/components/ui';
import { UserMenu } from '@/components/auth/UserMenu';
import { AppHeader } from '@/components/layout/AppHeader';

type Message = { kind: 'error' | 'success'; text: string };

function outcomeLabel(outcome: LegacySlugOutcome | undefined): string {
  if (!outcome) return '';
  if (outcome.status === 'updated') return 'Actualitzada';
  if (outcome.status === 'unchanged') return 'Ja estava bé';
  return outcome.message;
}

/**
 * One-time tool (admin #68): replaces the numeric slugs the import left in
 * place of the old `-N` placeholders, so no post shares an address with a
 * listing page of the public site.
 */
export function LegacySlugsAdmin() {
  const { user, signOut } = useAuth();
  const [rows, setRows] = useState<LegacySlugRow[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, LegacySlugOutcome>>(
    {}
  );
  const [busy, setBusy] = useState<'scan' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const allowed = Boolean(user && canManageCognitoUsers(user.groups));

  const ready = rows?.filter(row => !row.blocked) ?? [];
  const blockedCount = (rows?.length ?? 0) - ready.length;

  async function scan() {
    setBusy('scan');
    setMessage(null);
    setOutcomes({});
    try {
      const categories = await getAdminCategories();
      setRows(
        await scanLegacySlugs(
          legacySlugDependencies,
          categories.map(category => category.slug),
          (done, total) =>
            setProgress(`Llegint articles: ${done} de ${total}…`)
        )
      );
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No s’han pogut analitzar els articles.',
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function apply() {
    setConfirming(false);
    setBusy('apply');
    setMessage(null);
    let updated = 0;
    let failed = 0;
    // One post at a time: each save is re-read and version-checked.
    for (const [index, row] of ready.entries()) {
      setProgress(`Desant articles: ${index} de ${ready.length}…`);
      const outcome = await applyLegacySlugRow(legacySlugDependencies, row);
      if (outcome.status === 'updated') updated += 1;
      if (outcome.status === 'failed') failed += 1;
      setOutcomes(current => ({ ...current, [row.postId]: outcome }));
    }
    setBusy(null);
    setProgress(null);
    setMessage(
      failed === 0
        ? {
            kind: 'success',
            text: `${updated} article(s) actualitzats. Copia la llista de redireccions (a sota) abans de tornar a analitzar per comprovar que no en queda cap.`,
          }
        : {
            kind: 'error',
            text: `${updated} article(s) actualitzats i ${failed} amb errors. Copia la llista de redireccions abans de tornar a analitzar i repetir-ho.`,
          }
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Heading as="h1" size="xl">
          Inicia sessió
        </Heading>
        <Link href="/" className="text-primary underline">
          Torna a l’inici
        </Link>
      </main>
    );
  }
  if (!allowed) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Heading as="h1" size="xl">
          Accés restringit
        </Heading>
        <p className="mt-4 text-muted">
          Només els superadministradors poden actualitzar adreces.
        </p>
        <Link href="/" className="mt-6 inline-block text-primary underline">
          Torna als articles
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-primary">
      <AppHeader actions={<UserMenu user={user} onLogout={signOut} />} />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-primary"
        >
          <Icon name="arrow-left" /> Articles
        </Link>
        <div className="mb-10 border-b border-default pb-8">
          <Text
            variant="small"
            className="mb-3 uppercase tracking-widest text-muted"
          >
            Administració
          </Text>
          <Heading as="h1" size="xl">
            Adreces antigues
          </Heading>
          <p className="mt-3 max-w-2xl text-body">
            Alguns articles importats tenen un número com a adreça web (per
            exemple <code>/en/reflexions/68/</code>). Aquesta eina els dona
            l’adreça que correspon al títol. Només canvia l’adreça; el text, les
            imatges i l’estat de publicació no es toquen.
          </p>
        </div>

        {message && (
          <div
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`mb-6 border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-danger/30 text-danger' : 'border-success/30 text-success'}`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Button
            variant="secondary"
            onClick={() => void scan()}
            loading={busy === 'scan'}
            disabled={Boolean(busy)}
          >
            {rows ? 'Tornar a analitzar' : 'Analitzar articles'}
          </Button>
          {rows && ready.length > 0 && (
            <Button
              onClick={() => setConfirming(true)}
              loading={busy === 'apply'}
              disabled={Boolean(busy) || Object.keys(outcomes).length > 0}
            >
              Actualitzar {ready.length} article(s)
            </Button>
          )}
        </div>

        {progress && (
          <p role="status" className="mb-6 text-sm text-muted">
            {progress} Pot trigar un parell de minuts; no tanquis la pàgina.
          </p>
        )}

        {rows && rows.length === 0 && (
          <p role="status" className="border border-default p-6 text-muted">
            Cap article té una adreça antiga. No cal fer res.
          </p>
        )}

        {rows && rows.length > 0 && (
          <section aria-labelledby="legacy-slugs-title">
            <Heading as="h2" size="2xl" id="legacy-slugs-title">
              {rows.length} article(s) amb adreces antigues
            </Heading>
            {blockedCount > 0 && (
              <p className="mt-2 text-sm text-danger">
                {blockedCount} article(s) no es poden actualitzar
                automàticament; es mostren amb el motiu.
              </p>
            )}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-default text-muted">
                    <th className="py-2 pr-4 font-normal">Núm.</th>
                    <th className="py-2 pr-4 font-normal">Article</th>
                    <th className="py-2 pr-4 font-normal">Adreça actual</th>
                    <th className="py-2 pr-4 font-normal">Adreça nova</th>
                    <th className="py-2 font-normal">Estat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr
                      key={row.postId}
                      className="border-b border-subtle align-top"
                    >
                      <td className="py-3 pr-4 tabular-nums">
                        {String(row.sortOrder).padStart(3, '0')}
                      </td>
                      <td className="py-3 pr-4">
                        {row.title}
                        {row.published && (
                          <span className="ml-2 text-xs text-muted">
                            (publicat)
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {row.changes.map(change => (
                          <div key={change.language}>
                            /{change.language}/reflexions/{change.from}/
                          </div>
                        ))}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs break-all">
                        {row.changes.map(change => (
                          <div key={change.language}>
                            /{change.language}/reflexions/{change.to}/
                          </div>
                        ))}
                      </td>
                      <td
                        className={`py-3 ${row.blocked || outcomes[row.postId]?.status === 'failed' ? 'text-danger' : 'text-muted'}`}
                      >
                        {row.blocked ?? outcomeLabel(outcomes[row.postId])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-8" open={Object.keys(outcomes).length > 0}>
              <summary className="cursor-pointer text-sm text-muted">
                Llista de redireccions per al canvi de web
              </summary>
              <p className="mt-2 text-sm text-muted">
                Adreces del web anterior i la seva adreça nova.
              </p>
              <pre className="mt-3 overflow-x-auto border border-default p-4 text-xs">
                {legacyRedirects(rows).join('\n')}
              </pre>
            </details>
          </section>
        )}
      </div>

      <Modal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title="Actualitzar adreces"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel·lar
            </Button>
            <Button onClick={() => void apply()}>Actualitzar</Button>
          </>
        }
      >
        <p>
          Es desaran {ready.length} article(s) amb la seva adreça nova. Els
          articles publicats s’actualitzaran al web en uns minuts.
        </p>
      </Modal>
    </main>
  );
}
