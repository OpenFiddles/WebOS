# Contributing to WebOS

Thanks for your interest in contributing to WebOS! Bug reports, documentation improvements, accessibility fixes, UI polish, and code contributions are welcome.

## Before you start

1. Read the [README](README.md) to understand the project and its current limitations.
2. Check existing GitLab issues and merge requests to avoid duplicating work.
3. For substantial changes, open an issue or discussion first so the intended behavior and implementation can be agreed on.
4. Review [SECURITY.md](SECURITY.md) before reporting a potential vulnerability. Do not publish exploit details in a public issue.

## Development setup

Requirements: Node.js 24 or newer and npm.

```sh
git clone https://gitlab.com/openfiddles/WebOS.git
cd WebOS
npm install
npm run dev
```

Visit http://localhost:3000. Use `npm start` to run the server without Node's watch mode.

## Contribution workflow

1. Create a focused branch from the latest `main` branch.
2. Make the smallest coherent change that solves the problem.
3. Keep code consistent with the surrounding vanilla JavaScript, HTML, and CSS conventions.
4. Update user-facing documentation when behavior, settings, app APIs, or setup steps change.
5. Check whether startup assets need to be added to `public/sw.js`, and update the service-worker cache version when appropriate.
6. Test the affected behavior manually in a modern browser. Check both desktop and mobile layouts when shared code is involved.
7. Commit with a clear message describing the change.
8. Open a GitLab merge request against `main`, explain the motivation and implementation, and include screenshots or reproduction steps for UI changes.

Do not commit generated secrets, access tokens, private configuration, personal data, or large build artifacts unless they are explicitly required and approved for the project.

## Code and design guidelines

- Preserve the existing modular structure under `public/js/os/`, `public/css/`, and `public/html/`.
- Prefer browser-native APIs and avoid adding dependencies without a clear reason.
- Keep interfaces usable with keyboard navigation and assistive technology. Use semantic elements, accessible names, visible focus, and reduced-motion preferences.
- Handle unavailable browser capabilities and denied permissions gracefully.
- Treat all data received from apps, iframes, messages, remote sites, and user files as untrusted.
- Do not assume an iframe is a complete security boundary. Validate origins and message payloads, use the narrowest practical sandbox and permissions, and avoid exposing privileged APIs unnecessarily.
- Avoid claiming native hardware or operating-system access when a feature is only a browser API or best-effort approximation.
- Keep service-worker caching intentional. Startup assets belong in the core cache only when they are needed for the startup experience.

## Testing

The repository's current `npm test` command is a placeholder, not an automated test suite. Do not report it as a passing test suite.

For each change:

- Run the app locally with `npm run dev`.
- Exercise the changed feature and its relevant failure states.
- Check the browser console and network panel.
- Verify persistence across reloads if storage is involved.
- Verify the updated assets are actually served after service-worker activation; test a clean browser profile when cache behavior is relevant.
- Test mobile behavior for shared layout, navigation, or input changes.

If automated tests are added in the future, document their prerequisites and commands here.

## Merge request checklist

- [ ] The change has a clear purpose and is scoped appropriately.
- [ ] Existing behavior outside the intended scope is preserved.
- [ ] Relevant desktop/mobile paths were checked.
- [ ] No secrets, credentials, or personal data were added.
- [ ] Documentation and service-worker cache entries were updated where needed.
- [ ] Known limitations and manual test steps are included in the merge request.
- [ ] Any security-sensitive behavior received additional review.

## Community expectations

Be respectful, constructive, and patient. Critique code and ideas rather than people. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
