# Contributing

Thank you for helping improve the shared Borg MCP contract.

## Before Opening a Change

Open an issue for behavioral or wire-contract changes before implementing them.
Describe the affected consumers, the rollout order, and whether existing
clients or servers require a compatibility window. Small documentation and test
corrections can proceed directly to a pull request.

Keep this package implementation-neutral. Contributions should extend portable
contracts, pure helpers, canonical templates, or synthetic conformance data.
Runtime dependency changes require explicit justification and a security review.

## Development Workflow

Use Node.js 20 or newer, then run:

```sh
npm install
npm test
npm run check
npm run build
npm pack --dry-run
```

Pull requests should include tests for changed behavior and update the public
API or compatibility documentation when applicable. Wire behavior must be
represented by implementation-neutral vectors in `src/conformance` so every
server implementation can run the same cases.

Do not include secrets, access tokens, private URLs, customer data, or copied
production payloads in source, tests, commits, issues, or pull requests. Use
synthetic fixtures.

## Reporting Security Issues

Do not open a public issue for a suspected vulnerability. Follow the private
reporting process in [SECURITY.md](SECURITY.md).
