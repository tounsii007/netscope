# Security Policy

## Reporting a vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

To report a security problem privately, use GitHub's built-in mechanism:
**Security → Report a vulnerability** (top of this repo on GitHub).

Alternatively, email the maintainer directly (see `git log --format='%ae'` for
the active address).

A useful report includes:

1. A description of the vulnerability and what an attacker could achieve.
2. Reproduction steps — the shorter, the better.
3. The conditions required (authentication state, browser, OS).
4. A suggested mitigation if you have one.

## Response timeline

| Severity  | Acknowledgement | Fix target |
|-----------|----------------|-----------|
| Critical  | 1 business day  | 7 days    |
| High      | 2 business days | 14 days   |
| Medium    | 3 business days | 30 days   |
| Low       | 5 business days | 90 days   |

## Supported versions

Only the latest commit on the **default branch** and the most recent tagged
release receive security patches. There are no long-term-support branches.

## Coordinated disclosure

After a fix is shipped we will publish a GitHub Security Advisory and credit
the reporter (with their consent). Please allow us the agreed fix window
before any public disclosure or PoC posting.
