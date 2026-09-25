# Design system

The admin shares its visual language with the public site (`../tonibover`):
black canvas, white type in a few strengths, Bodoni Moda for display text,
Nunito for everything else, hairline borders, square corners and slow
color-only transitions. Nothing competes with the content.

This document is the source of truth for UI decisions. The tokens live in
`styles/tokens.css`, element defaults in `styles/base.css`, and reusable
components in `components/ui` and `components/layout`.

## Principles

1. **Monochrome first.** Hierarchy comes from white at different strengths,
   type size and spacing. There is no brand accent color.
2. **Color means status.** Green, amber and red appear only to say
   _published / pending / failed_. Never for decoration.
3. **Flat and black.** Panels, modals and menus sit on the page's black with
   a hairline border. No filled grey surfaces, no shadows.
4. **Quiet motion.** Colors fade over 300ms. Nothing scales, bounces or lifts.

## Structure

```
styles/
  tokens.css   palette (:root --palette-*) + semantic tokens (@theme)
  base.css     body, selection, focus ring, reduced motion, .prose
app/
  globals.css  entry: imports Tailwind + the files above
  fonts.ts     next/font setup (Bodoni Moda, Nunito)
components/
  ui/          primitives: Button, Badge, Input, Select, Modal, ...
  ui/field.ts  shared form-field classes (label, control, message)
  layout/      page chrome: AppHeader
```

Tokens have two tiers:

- **Palette** (`--palette-*` in `:root`): raw hex values. Components never
  reference these.
- **Theme** (`@theme`): semantic names that Tailwind turns into utilities.
  Tailwind's default palette, radii, shadows, font weights and letter
  spacings are removed with `--*: initial`, so an off-system class such as
  `bg-gray-900` or `shadow-lg` simply does not exist.

`pnpm check:design-tokens` (part of `pnpm ci`) scans string literals in
`app/` and `components/` for color, type, border, radius, shadow and motion
utilities that the theme does not generate, and for hardcoded hex colors. It
is a guard rail, not a proof: classes built by string concatenation can slip
past it.

## Color

### Text

| Class            | Value       | Use                                    |
| ---------------- | ----------- | -------------------------------------- |
| `text-primary`   | white       | Titles, values, active items           |
| `text-secondary` | gray-200    | Hover state of the wordmark            |
| `text-body`      | gray-300    | Running text, default control text     |
| `text-muted`     | gray-400    | Labels, meta, secondary actions        |
| `text-subtle`    | gray-500    | Placeholders, hints, disabled meta     |
| `text-primary/N` | white at N% | Only `/80`, `/60`, `/40` (as the site) |

### Backgrounds

| Class            | Use                                             |
| ---------------- | ----------------------------------------------- |
| `bg-background`  | Page, panels, modals, menus (all black)         |
| `bg-nav`         | Sticky header (black 95%, with `backdrop-blur`) |
| `bg-scrim`       | Modal backdrop, overlays on images              |
| `bg-overlay-2`   | Row hover, loading placeholders (never a panel) |
| `bg-overlay-5`   | Hover fill for buttons and menu items           |
| `bg-overlay-10`  | Active / selected fill                          |
| `bg-overlay-20+` | Toggle track on, rare emphasis                  |

### Borders

| Class            | Use                                        |
| ---------------- | ------------------------------------------ |
| `border-default` | Controls, cards, panels, dividers          |
| `border-subtle`  | Header and section separators, quiet chips |
| `border-strong`  | Hovered controls, secondary buttons        |
| `border-focus`   | Focused form fields                        |

### Status

| Token     | Meaning                      |
| --------- | ---------------------------- |
| `success` | Published, complete, saved   |
| `warning` | Draft, pending, needs action |
| `danger`  | Error, destructive action    |
| `info`    | Neutral system note (grey)   |

Always the same recipe: `text-{status}` + `border-{status}/30` + a fill of
`bg-{status}/10` for badges and hovers or `bg-{status}/5` for banners. Body
copy inside a banner stays `text-body`; only the title or icon takes the
status color. Use `<Badge tone="…">` rather than composing it by hand.

### Do / don't

```tsx
// Don't: a grey filled panel (#111827), a shadow and an off-palette hue
<div className="bg-gray-900 shadow-2xl text-sky-300">…</div>

// Do: black with a hairline, status color only where it carries meaning
<div className="border border-default bg-background">…</div>
<Badge tone="warning">Pendent</Badge>
```

## Typography

| Role               | Recipe                                                   |
| ------------------ | -------------------------------------------------------- |
| Wordmark           | `font-serif italic font-semibold text-2xl`               |
| Page / section     | `<Heading>` (serif, sizes `xl`–`5xl`)                    |
| Card title, quotes | `font-serif`                                             |
| Body               | `<Text>` (Nunito, `text-base leading-relaxed text-body`) |
| Field label        | `fieldLabelClasses`: `text-xs uppercase tracking-wider`  |
| Eyebrow / brand    | `text-2xs` or `text-sm`, `uppercase tracking-widest`     |
| Numbers            | add `tabular-nums`                                       |

- Weights: `font-light` (300), `font-normal` (400), `font-semibold` (600).
  These are the only weights the site loads.
- Letter spacing: `tracking-wide` (buttons, nav), `tracking-wider` (uppercase
  labels), `tracking-widest` (wordmark and eyebrows only).
- Serif is for display text. Small uppercase labels are always sans.
- `text-2xs` (11px) is the smallest size, for uppercase micro labels only.

## Shape, space, motion

- **Corners:** square. `rounded-full` only for avatars, dots and toggles.
- **Elevation:** none. Separate layers with borders and the scrim.
- **Spacing:** Tailwind's 4px scale. Page gutter `px-6`, content width
  `max-w-6xl` (lists) or `max-w-4xl` (reading).
- **Motion:** `transition-colors` (300ms ease-out by default). Entrances use
  `animate-fade-in` / `animate-fade-in-up`. No `scale-*` on hover.
- **Focus:** every interactive element gets a 1px white/60 outline from
  `base.css`. Form fields swap it for `border-focus`. Don't add rings.

## Components

| Component                                 | Notes                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `AppHeader`                               | The only page header. `leading` (defaults to wordmark) and `actions`.                  |
| `Button`                                  | `primary` (outline that inverts on hover), `secondary`, `ghost`, `destructive`, `icon` |
| `Badge`                                   | `tone`: `neutral`, `success`, `warning`, `danger`, `info`                              |
| `StatusBadge`                             | Published / draft, built on `Badge`                                                    |
| `Input`, `Textarea`, `Select`, `Dropdown` | Share `components/ui/field.ts`                                                         |
| `Modal`                                   | Black panel, hairline border, scrim backdrop                                           |
| `Heading`, `Text`, `Link`, `Container`    | Same API as the site's Astro components                                                |

When a pattern repeats in two features, promote it to `components/ui`
instead of copying class strings.
