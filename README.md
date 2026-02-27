<a id="readme-top"></a>

[![Build][build-shield]][build-url]
[![Release][release-shield]][release-url]
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stars][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![License][license-shield]][license-url]

<div align="center">
  <img src="icons/icon128.png" alt="Bluemine logo" width="96" height="96" />

  <h1>Bluemine</h1>
  <p><strong>Opt-in Redmine UX upgrades for teams that want more signal, less friction.</strong></p>
  <p>
    <a href="https://github.com/Bluemine-Group/Bluemine/issues">Report Bug</a>
    ·
    <a href="https://github.com/Bluemine-Group/Bluemine/issues">Request Feature</a>
    ·
    <a href="https://github.com/Bluemine-Group/Bluemine/actions/workflows/build-extension.yml">Download Build Artifact</a>
  </p>
</div>

## Table of Contents

- [About](#about)
- [Feature Highlights](#feature-highlights)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Permissions and Privacy](#permissions-and-privacy)
- [Build and Release](#build-and-release)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## About

Bluemine is a Manifest V3 browser extension that enhances Redmine with optional improvements.  
Every feature is independently toggleable, so teams can enable only what they need.

Primary goals:

- Improve day-to-day flow in Redmine Agile boards.
- Surface GitLab MR context where planning and execution happen.
- Keep credentials local and user-controlled.
- Stay modular so new features are easy to ship and maintain.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Feature Highlights

| Feature | Status | What it does |
| --- | --- | --- |
| GitLab MR integration | Available | Shows merge request status directly on Agile board cards/stories. |
| Enhanced Agile board | Available | Restores scroll position, auto-reloads when navigating back, and preserves collapsed swimlane state. |
| Release awareness in popup | Available | Highlights when a newer GitHub release is available. |
| Theme system + dark blue mode | Planned | Introduce visual themes with low-light friendly defaults. |
| AI task/writing helpers (BYO key) | Planned | Optional AI-assisted task creation and writing support. |
| Live stale-data/sync background checks | Planned | Warn and sync around stale Agile board state. |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Architecture

High-level structure:

- `content/`: Content scripts that run on Redmine pages and render UI enhancements.
- `background/`: Service worker for GitLab API calls, caching, and cross-context messaging.
- `popup/`: Settings UI and feature toggles.
- `features/`: Feature-level conventions and modularization notes ([README](features/README.md)).
- `lib/browser-polyfill.js`: Browser API compatibility layer.

Flow:

1. Content scripts detect relevant Redmine pages.
2. Feature toggles are read from extension storage.
3. For GitLab features, content scripts request data from the background worker.
4. Background worker fetches/caches GitLab data and returns normalized payloads.
5. UI enhancements are rendered only when their feature is enabled.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

- Chromium-based browser (Chrome/Edge/Brave) or Firefox (121+).
- Access to a Redmine instance.
- Optional: GitLab Personal Access Token for MR integration.

### Install from GitHub Actions artifact

1. Open the [Build workflow runs][build-url].
2. Download the latest `bluemine-extension-<version>.zip` artifact.
3. Extract the ZIP.
4. Load the unpacked extension:
   - Chrome/Edge: go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**.
   - Firefox: go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, choose `manifest.json`.

### Local development install

1. Clone the repository.
2. Load it as unpacked extension in your target browser (same steps as above).

No Node.js build step is required for local loading in the current setup.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Configuration

Open the extension popup and configure:

- `GitLab Integration` toggle.
- `Enhanced Agile board` toggle.
- `GitLab Base URL` (example: `https://gitlab.example.com`).
- `GitLab API Key` (`glpat-...`).
- `Project Mapping` with one line per project:

```txt
redmine-project-slug=123
another-project=456
```

Mapping format is `redmine_project_name=gitlab_project_id`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Permissions and Privacy

Manifest permissions used:

- `storage`: Persist feature toggles and settings locally.
- `activeTab`: Operate on the current tab context.
- `host_permissions` on `http://*/*` and `https://*/*`: Support self-hosted/public Redmine and GitLab deployments.

Data handling:

- GitLab credentials are stored in extension local storage.
- GitLab requests are executed in the background worker.
- No analytics/telemetry SDKs are included.
- External network calls are limited to:
  - Configured GitLab API endpoints (feature-dependent).
  - GitHub Releases API (popup update indicator).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Build and Release

CI/CD is handled by GitHub Actions via [`.github/workflows/build-extension.yml`](.github/workflows/build-extension.yml):

- Triggered on pushes (all branches), `v*` tags, and manual dispatch.
- Packages repository files (excluding CI/git/temporary artifacts) into a ZIP.
- Uploads `bluemine-extension-<version>.zip` as a workflow artifact.
- `<version>` is the Git tag name on tag builds (for example `v1.2.3`), otherwise the short commit hash.
- If the run is for a commit that is at `main` HEAD and that commit has a `v*` tag, it also creates a GitHub Release for that tag and attaches the ZIP.
- Release notes are auto-generated as commit messages since the previous `v*` release tag.

This artifact is the current distribution channel prior to browser store publication.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- Dark mode toggle.
- Theme switcher with curated light/dark themes.
- New dark blue theme.
- Background polling for stale-task warnings.
- Background sync support for Agile board freshness.
- AI-assisted task creation (user API key, project-scoped).
- AI writing support in tasks (user API key, project-scoped).
- Open selected board tasks in a sidebar.

Track and discuss in [Issues][issues-url].

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "feat: add your feature"`).
4. Push (`git push origin feature/your-feature`).
5. Open a Pull Request.

Please use [Issues][issues-url] for bug reports, questions, and proposals.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the MIT License. See [LICENSE](LICENSE).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[build-shield]: https://img.shields.io/github/actions/workflow/status/Bluemine-Group/Bluemine/build-extension.yml?style=for-the-badge&label=build
[build-url]: https://github.com/Bluemine-Group/Bluemine/actions/workflows/build-extension.yml
[release-shield]: https://img.shields.io/github/v/release/Bluemine-Group/Bluemine?style=for-the-badge
[release-url]: https://github.com/Bluemine-Group/Bluemine/releases
[contributors-shield]: https://img.shields.io/github/contributors/Bluemine-Group/Bluemine.svg?style=for-the-badge
[contributors-url]: https://github.com/Bluemine-Group/Bluemine/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Bluemine-Group/Bluemine.svg?style=for-the-badge
[forks-url]: https://github.com/Bluemine-Group/Bluemine/network/members
[stars-shield]: https://img.shields.io/github/stars/Bluemine-Group/Bluemine.svg?style=for-the-badge
[stars-url]: https://github.com/Bluemine-Group/Bluemine/stargazers
[issues-shield]: https://img.shields.io/github/issues/Bluemine-Group/Bluemine.svg?style=for-the-badge
[issues-url]: https://github.com/Bluemine-Group/Bluemine/issues
[license-shield]: https://img.shields.io/github/license/Bluemine-Group/Bluemine.svg?style=for-the-badge
[license-url]: https://github.com/Bluemine-Group/Bluemine/blob/main/LICENSE
