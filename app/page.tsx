import {
  Button,
  Card,
  Heading,
  Icon,
  Image,
  Link,
  SectionTitle,
  Text,
} from "@/components/ui";

export default function Home() {
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
      </main>
    </div>
  );
}
