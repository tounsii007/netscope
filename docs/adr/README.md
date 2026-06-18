# Architecture Decision Records

This directory holds the project's Architecture Decision Records (ADRs) — short
documents that capture a single significant technical decision, the context that
forced it, and the consequences we accept by making it.

## Convention

- **Filenames** are numbered monotonically and slugged from the title:
  `NNNN-short-slug.md` (e.g. `0001-ssrf-defense-canonicalise-hostnames.md`).
  Numbers never get reused.
- **Sections** are fixed: `Status`, `Context`, `Decision`, `Consequences`,
  optionally `References`. Use the same headings so the records stay diffable
  and grep-able.
- **Status** values: `Proposed`, `Accepted`, `Deprecated`, `Superseded by NNNN`.
- **Immutable once accepted.** Do not retroactively edit a decision to reflect
  a new reality. Instead, write a new ADR that supersedes it, and update the
  old record's Status line to `Superseded by NNNN`. The history is the value.
- Keep records short (under ~500 words). Link out to code and external specs
  rather than restating them.

## Index

- [0001 — SSRF defense: canonicalise hostnames via IDN.toASCII(STD3)](./0001-ssrf-defense-canonicalise-hostnames-via-idn-toascii-std3-wit.md)
- [0002 — Use ThreadLocalRandom (not SecureRandom/UUID) for error-correlation IDs](./0002-use-threadlocalrandom-not-securerandom-uuid-for-error-correl.md)
