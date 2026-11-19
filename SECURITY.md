# Security Policy

## Reporting a vulnerability

Please do not disclose exploitable security issues in a public issue or merge request.

Use a **confidential GitLab issue** in the WebOS project to contact the maintainers privately. Include:

- A concise description of the affected component and potential impact.
- The steps needed to reproduce the issue, using a safe proof of concept.
- Relevant versions, browser details, and logs with secrets and personal data removed.
- Any suggested mitigation, if known.

Do not include real credentials, access tokens, private user data, or data belonging to other people.

## Areas that deserve special care

WebOS is a browser application with a server-side web compatibility proxy. Security-sensitive areas include:

- URL validation, DNS resolution, redirects, and server-side proxy requests.
- Cross-origin isolation and response headers.
- Iframe sandbox attributes, permissions, and cross-window messaging.
- App Creator and JavaScript/WebAssembly runtime imports.
- Filesystem and permission APIs.
- Service-worker caching and update behavior.

The browser proxy is not a general-purpose browser engine. Changes to its network access controls should receive careful review to avoid server-side request forgery and access to private network resources.

## Supported versions

There is currently no published version support matrix. Report vulnerabilities against the latest code on the `main` branch and include the commit or deployment version where possible.
