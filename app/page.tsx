'use client';

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Heading,
  Icon,
  Image,
  Input,
  Link,
  Modal,
  SectionTitle,
  Select,
  Table,
  Text,
  Textarea,
  Toast,
} from "@/components/ui";

interface User {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
}

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }>>([]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const tableData: User[] = [
    { id: 1, name: 'John Doe', email: 'john@example.com', status: 'active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'inactive' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com', status: 'active' },
  ];

  return (
    <div className="min-h-screen p-8 pb-20 sm:p-20">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Design System Migration</h1>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Button Component</h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium mb-3">Ghost Variant</h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="ghost" size="sm">
                  Small Ghost Button
                </Button>
                <Button variant="ghost" size="md">
                  Medium Ghost Button
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-3">Icon Variant</h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="icon" aria-label="Icon button">
                  ✕
                </Button>
                <Button variant="icon" aria-label="Menu">
                  ☰
                </Button>
                <Button variant="icon" aria-label="Settings">
                  ⚙
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Link Component</h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium mb-3">Link Variants</h3>
              <div className="flex gap-6 items-center flex-wrap">
                <Link href="/" variant="primary">
                  Primary Link
                </Link>
                <Link href="/" variant="muted">
                  Muted Link
                </Link>
                <Link href="/" variant="secondary">
                  Secondary Link
                </Link>
                <Link href="/" variant="accent-border">
                  Accent Border Link
                </Link>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-3">Active State</h3>
              <Link href="/" active>
                Active Link
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Card Component</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card href="/" aria-label="Example card 1">
              <h3 className="text-xl font-medium">Card Title</h3>
              <p className="text-body">
                This is a card component with some content.
              </p>
            </Card>

            <Card
              href="/"
              as="article"
              image={
                <div className="h-32 bg-surface rounded mb-2 flex items-center justify-center text-muted">
                  Image Placeholder
                </div>
              }
              aria-label="Example card 2"
            >
              <h3 className="text-xl font-medium">Card with Image</h3>
              <p className="text-body">This card includes an image slot.</p>
            </Card>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Heading Component</h2>
          <div className="space-y-6">
            <Heading as="h1" size="5xl">
              Heading H1 - 5xl
            </Heading>
            <Heading as="h2" size="4xl">
              Heading H2 - 4xl
            </Heading>
            <Heading as="h3" size="3xl" variant="secondary">
              Heading H3 - 3xl Secondary
            </Heading>
            <Heading as="h4" size="2xl" variant="muted" italic>
              Heading H4 - 2xl Muted Italic
            </Heading>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Text Component</h2>
          <div className="space-y-4">
            <Text variant="body">
              This is body text with relaxed leading and default styling.
            </Text>
            <Text variant="caption">
              This is caption text with serif and italic.
            </Text>
            <Text variant="small">This is small muted text.</Text>
            <Text variant="label">THIS IS A LABEL</Text>
            <Text variant="body" serif>
              This is body text with serif font.
            </Text>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Icon Component</h2>
          <div className="flex gap-6 items-center flex-wrap">
            <Icon name="menu" size="8" />
            <Icon name="close" size="8" />
            <Icon name="chevron-left" size="8" />
            <Icon name="chevron-right" size="8" />
            <Icon name="arrow-left" size="8" />
            <Icon name="arrow-right" size="8" />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Image Component</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Image
              src="https://via.placeholder.com/600x400"
              alt="Example image"
              aspect="video"
              hover="opacity"
            />
            <Image
              src="https://via.placeholder.com/400x400"
              alt="Example with caption"
              aspect="square"
              hover="scale"
              caption="This is an image caption with scale hover effect"
            />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">
            SectionTitle Component
          </h2>
          <SectionTitle>This is a section title</SectionTitle>
          <Text>
            Section titles are preset h2 headings with xl size, secondary
            variant, and italic styling.
          </Text>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Badge Component</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-3">Badge Variants</h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Badge variant="default">Default</Badge>
                <Badge variant="accent">Accent</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="error">Error</Badge>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-3">Badge Sizes</h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Badge size="sm">Small Badge</Badge>
                <Badge size="md">Medium Badge</Badge>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Input Component</h2>
          <div className="space-y-6 max-w-md">
            <Input
              label="Email"
              type="email"
              placeholder="john@example.com"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              helperText="Password must be at least 8 characters"
            />
            <Input
              label="Username"
              type="text"
              error="This username is already taken"
              isInvalid
            />
            <div>
              <h3 className="text-lg font-medium mb-3">Input Sizes</h3>
              <div className="space-y-3">
                <Input size="sm" placeholder="Small input" />
                <Input size="md" placeholder="Medium input" />
                <Input size="lg" placeholder="Large input" />
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Textarea Component</h2>
          <div className="space-y-6 max-w-md">
            <Textarea
              label="Description"
              placeholder="Enter a description..."
              value={textareaValue}
              onChange={(e) => setTextareaValue(e.target.value)}
              showCharCount
              maxChars={200}
            />
            <Textarea
              label="Comments"
              placeholder="Your comments"
              error="This field is required"
              isInvalid
            />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Select Component</h2>
          <div className="space-y-6 max-w-md">
            <Select
              label="Category"
              options={[
                { value: 'tech', label: 'Technology' },
                { value: 'design', label: 'Design' },
                { value: 'business', label: 'Business' },
                { value: 'other', label: 'Other' },
              ]}
              placeholder="Select a category..."
              value={selectValue}
              onChange={(e) => setSelectValue(e.target.value)}
            />
            <Select
              label="Priority"
              options={[
                {
                  group: 'High Priority',
                  items: [
                    { value: 'urgent', label: 'Urgent' },
                    { value: 'high', label: 'High' },
                  ],
                },
                {
                  group: 'Low Priority',
                  items: [
                    { value: 'medium', label: 'Medium' },
                    { value: 'low', label: 'Low' },
                  ],
                },
              ]}
            />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Toast Component</h2>
          <div className="flex gap-4 flex-wrap">
            <Button variant="ghost" onClick={() => showToast('This is an info message', 'info')}>
              Show Info Toast
            </Button>
            <Button variant="ghost" onClick={() => showToast('Success! Action completed', 'success')}>
              Show Success Toast
            </Button>
            <Button variant="ghost" onClick={() => showToast('Error occurred!', 'error')}>
              Show Error Toast
            </Button>
            <Button variant="ghost" onClick={() => showToast('Warning: Check this', 'warning')}>
              Show Warning Toast
            </Button>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Modal Component</h2>
          <Button variant="ghost" onClick={() => setIsModalOpen(true)}>
            Open Modal
          </Button>
          <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Confirm Action"
            footer={
              <div className="flex gap-4">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsModalOpen(false);
                    showToast('Action confirmed!', 'success');
                  }}
                >
                  Confirm
                </Button>
              </div>
            }
          >
            <p>Are you sure you want to perform this action?</p>
            <p className="mt-2 text-muted text-sm">This action cannot be undone.</p>
          </Modal>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Table Component</h2>
          <Table
            data={tableData}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'email', label: 'Email' },
              {
                key: 'status',
                label: 'Status',
                render: (value) => (
                  <Badge variant={value === 'active' ? 'accent' : 'default'}>
                    {String(value)}
                  </Badge>
                ),
              },
            ]}
            actions={[
              {
                label: 'Edit',
                onClick: (row) => showToast(`Editing ${row.name}`, 'info'),
              },
              {
                label: 'Delete',
                onClick: (row) => showToast(`Deleted ${row.name}`, 'error'),
              },
            ]}
            striped
            hoverable
          />
        </section>
      </main>

      {/* Toast Container */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
        />
      ))}
    </div>
  );
}
