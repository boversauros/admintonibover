# Sanitized backup fixture

`sanitized-backup.json` is entirely fictional. It preserves the version 1
backup shape while covering:

- Catalan and English content;
- translated taxonomy;
- language-specific keyword links;
- text and image reference metadata;
- a source main-image link and missing image slots;
- one intentionally incomplete English translation; and
- enough relational data for negative tests to introduce a broken foreign key,
  duplicate normalized slug, malformed date, or oversized aggregate.

Tests derive invalid variants in memory. The private June backup and generated
private validation reports must never be copied into this directory or committed.
