'use client';

import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, Button, Icon, Text } from '@/components/ui';

interface FormHeaderProps {
  isSubmitting: boolean;
  isEditMode: boolean;
  readOnly?: boolean;
}

export function FormHeader({
  isSubmitting,
  isEditMode,
  readOnly = false,
}: FormHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    router.push('/');
  };

  return (
    <AppHeader
      leading={
        <Button variant="ghost" onClick={handleBack}>
          <Icon name="chevron-left" size="5" />
          <Text as="span" variant="small">
            Tornar
          </Text>
        </Button>
      }
      actions={
        readOnly ? (
          <Badge size="md">Només lectura</Badge>
        ) : (
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {isSubmitting ? (isEditMode ? 'Desant...' : 'Creant...') : 'Desar'}
          </Button>
        )
      }
    />
  );
}
