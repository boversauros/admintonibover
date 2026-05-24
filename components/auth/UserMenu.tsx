'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Icon, Text } from '@/components/ui';
import type { IconName } from '@/components/ui/Icon';

interface UserMenuProps {
  user: User;
  onBackup: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  isBackingUp?: boolean;
}

function getInitials(user: User): string {
  const name = user.user_metadata?.name || user.user_metadata?.full_name;
  if (typeof name === 'string' && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }

  if (user.email) {
    const local = user.email.split('@')[0];
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    return user.email.charAt(0).toUpperCase();
  }

  return 'U';
}

function getDisplayName(user: User): string | null {
  const name = user.user_metadata?.name || user.user_metadata?.full_name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return null;
}

interface MenuItemProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
}

function MenuItem({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  loading = false,
}: MenuItemProps) {
  const variantClasses =
    variant === 'destructive'
      ? 'text-red-400/90 hover:bg-red-500/10 hover:text-red-300 focus-visible:bg-red-500/10 focus-visible:text-red-300'
      : 'text-body hover:bg-overlay-5 hover:text-primary focus-visible:bg-overlay-5 focus-visible:text-primary';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled || loading}
      className={`group flex w-full items-center gap-3 px-3.5 py-2.5 text-sm transition-colors-smooth focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses}`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {loading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <Icon name={icon} size="4" />
        )}
      </span>
      <span className="flex-1 text-left leading-tight">{label}</span>
    </button>
  );
}

export function UserMenu({
  user,
  onBackup,
  onLogout,
  isBackingUp = false,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const initials = getInitials(user);
  const displayName = getDisplayName(user);
  const email = user.email ?? '';

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const handleBackup = async () => {
    await onBackup();
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await onLogout();
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Menú d'usuari de ${displayName ?? email ?? 'usuari'}`}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-overlay-10 text-sm font-medium text-primary ring-1 transition-all-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-overlay-50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          isOpen
            ? 'bg-overlay-20 ring-overlay-40 scale-105'
            : 'ring-overlay-10 hover:bg-overlay-15 hover:ring-overlay-30 hover:scale-105 active:scale-95'
        }`}
      >
        <span aria-hidden="true">{initials}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Menú d'usuari"
          className="absolute right-0 mt-3 w-72 origin-top-right overflow-hidden border border-overlay-10 bg-surface shadow-2xl shadow-black/60 animate-scale-in"
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-subtle bg-overlay-2">
            <div
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-overlay-10 text-xs font-medium text-primary ring-1 ring-overlay-10"
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              {displayName ? (
                <>
                  <Text
                    as="span"
                    variant="small"
                    className="block truncate text-primary font-medium"
                  >
                    {displayName}
                  </Text>
                  <Text
                    as="span"
                    variant="small"
                    className="block truncate text-muted text-xs mt-0.5"
                  >
                    {email}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    as="span"
                    variant="label"
                    className="block text-2xs uppercase text-subtle"
                  >
                    Sessió iniciada com a
                  </Text>
                  <span
                    title={email}
                    className="block truncate text-sm text-primary mt-0.5"
                  >
                    {email}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="py-1.5">
            <MenuItem
              icon="download"
              label={
                isBackingUp ? 'Generant còpia...' : 'Descarregar còpia de seguretat'
              }
              onClick={handleBackup}
              loading={isBackingUp}
            />
          </div>

          <div className="border-t border-subtle py-1.5">
            <MenuItem
              icon="log-out"
              label="Tancar sessió"
              onClick={handleLogout}
              variant="destructive"
            />
          </div>
        </div>
      )}
    </div>
  );
}
