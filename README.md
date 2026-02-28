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

Bluemine is a Manifest V3 browser extension for Chrome and Firefox that enhances Redmine with optional, independently toggleable improvements.

## Features

| Feature | What it does |
| --- | --- |
| **GitLab MR integration** | Shows merge request status on Agile board cards and issue pages. |
| **Enhanced Agile board** | Soft-reloads the board in place after actions (preserving scroll), restores collapsed swimlane state across refreshes, and adds a collapse/expand toolbar. |
| **Shift+Hover selection** | Hold Shift and hover over cards to select them for bulk actions. |
| **Command Palette** | Keyboard-driven bulk commands on selected cards without leaving the page. |

## Command Palette

Press **Space** while one or more cards are selected (no text input focused). The palette opens with options fetched live from Redmine.

### Categories

| Category | What it does |
| --- | --- |
| Status | Change status of selected cards |
| Assignee | Reassign selected cards |
| Tracker | Change tracker of selected cards |
| Target version | Set target version of selected cards |
| Reviewer | Set reviewer field |
| Merged | Set merged-by field |
| Reviewed | Set reviewed-by field |
| Bulk Edit | Open the Redmine bulk edit form |
| Copy | Copy selected card IDs to clipboard |

### Keyboard shortcuts

**Status abbreviations** — type to jump directly to a status:

| Shortcut | Status |
| --- | --- |
| `cl` | Closed |
| `new` | New |
| `ip` | In Progress |
| `rs` | Resolved |
| `fb` | Feedback |
| `rj` | Rejected |
| `oh` | On Hold |
| `co` | Confirmed |

**Category prefixes** — type to filter to a category, then add a space and continue typing to filter by name within it:

| Prefix | Category |
| --- | --- |
| `as` | Assignee |
| `re` | Reviewer |
| `tr` | Tracker |
| `tv` | Target version |
| `mg` | Merged |
| `rd` | Reviewed |

**Person name abbreviation** — first letter of first name + first letter of last name + last letter of last name:

- "Anna Berg" → `abg`
- "Erik Holm" → `ehm`

Works standalone or after a category prefix (e.g. `as mak`). Abbreviation matches rank above substring and fuzzy matches.

### Navigation

| Key | Action |
| --- | --- |
| ↑ / ↓ | Navigate the list |
| **Tab** | Queue the highlighted command as a chip |
| **Enter** | Execute the highlighted command (or all queued chips at once) |
| **Backspace** | Remove last queued chip (when input is empty) |
| **Escape** | Close without executing |

### Batch mode

Tab queues commands as chips. Multiple commands from different categories are merged into a single request on Enter. Each category allows only one chip at a time — queuing a second command in the same category replaces the first. **Bulk Edit and Copy IDs cannot be chained** with other commands.

## Getting Started

### Prerequisites

- Chrome/Edge/Brave or Firefox 121+
- Access to a Redmine instance
- Optional: GitLab Personal Access Token for MR integration

### Install from GitHub Actions

1. Open the [Build workflow runs][build-url].
2. Download the latest `bluemine-extension-<version>.zip` artifact.
3. Extract the ZIP and load as an unpacked extension:
   - **Chrome/Edge**: `chrome://extensions` → Developer mode → Load unpacked
   - **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `manifest.json`

No build step required.

## Configuration

Open the extension popup to configure:

- Feature toggles (GitLab MR, Enhanced Agile board, Shift+Hover, Command Palette)
- GitLab Base URL (`https://gitlab.example.com`)
- GitLab API Key (`glpat-...`)
- Project mapping: one `redmine-project-slug=gitlab_project_id` per line
- Command Palette: Copy IDs separator (default: ` & `)

## Permissions and Privacy

| Permission | Purpose |
| --- | --- |
| `storage` | Persist feature toggles and settings locally |
| `activeTab` | Operate on the current tab |
| `host_permissions` (`http://*/*`, `https://*/*`) | Support self-hosted Redmine and GitLab instances |

No analytics or telemetry. External network calls are limited to the configured GitLab API (when enabled) and the GitHub Releases API (popup update indicator).

## Build and Release

CI via GitHub Actions ([workflow](.github/workflows/build-extension.yml)):

- Triggered on push, `v*` tags, and manual dispatch.
- Packages the repository and uploads `bluemine-extension-<version>.zip` as a workflow artifact.
- On tagged commits at `main` HEAD, also creates a GitHub Release with the ZIP attached and auto-generated release notes (commit messages since the previous tag).

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
