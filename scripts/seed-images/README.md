# Seed images

Drop 4 image files here before running `pnpm run seed`:

- `main-1.jpg` (or `.png` / `.webp` / `.avif`)
- `main-2.jpg`
- `thumb-1.jpg`
- `thumb-2.jpg`

Max 5MB each. The seed script uploads `main-*` to the `post-images` bucket and `thumb-*` to `post-thumbnails`, then randomly assigns one of each to every seed post.

Re-running the seed wipes prior SEED images from Storage + DB and re-uploads from this folder.
