'use client';

import { useRouter } from 'next/navigation';
import { Button, Icon, Text } from '@/components/ui';

interface FormHeaderProps {
  isSubmitting: boolean;
  isEditMode: boolean;
}

export function FormHeader({ isSubmitting, isEditMode }: FormHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-nav backdrop-blur-sm border-b border-default">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack}>
          <Icon name="chevron-left" size="5" />
          <Text as="span" variant="small">
            Tornar
          </Text>
        </Button>

        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? (isEditMode ? 'Desant...' : 'Creant...') : 'Desar'}
        </Button>
      </div>
    </header>
  );
}
