# Bluemine

Bluemine is a Chrome extension that improves the Redmine user experience for both self-hosted and public Redmine instances.

This project is built in public, and every improvement is opt-in so each team can enable only what they need.

## Why "Bluemine"?

The name comes from one of the first planned features: a theme switcher.
Our first theme target is a dark blue mode for better low-light usability.

## Current Status

### Current feature(s)

- GitLab Integration: show merge-request status on Agile board cards and stories
- Enhanced Agile board:
  - Restore scroll position when reloading the board
  - Auto-reload when navigating back to the board (bypasses browser cache)
  - Remember collapsed/expanded swimlane row state across reloads

### Coming soon

- Dark mode toggle
- Theme switcher (with specific light and dark themes)
- New dark blue theme
- Automatic background polling for open tasks to warn when saving may fail due to stale data
- Automatic background polling to sync changes on the Agile task board
- AI support for adding tasks (bring your own API key, scoped per project)
- AI writing support inside tasks (bring your own API key, scoped per project)
- Open clicked task in a sidebar from the Agile board

## How It Works

- Bluemine runs only when a Redmine site is open.
- Redmine pages are auto-detected from response headers (`Set-Cookie` containing `_redmine_session`).
- It uses the Redmine page/session context to interact with Redmine APIs.
- GitLab MR API calls are executed from the extension background context via message passing (avoids page-context CORS issues).
- GitLab API keys are read and used only in extension storage/background context, not in page context.
- Every improvement in Bluemine is individually opt-in.
- The extension popup is a settings menu with feature toggles.
- Some features include additional configuration fields.

## Architecture

- Each improvement lives in its own folder under `features/<feature-slug>/`.
- Feature settings are toggled in the extension popup.
- Feature state is persisted using Chrome extension storage.

See `/features/README.md` for feature folder conventions.

## Installation

### Option 1: Install from GitHub Actions artifact (manual install)

1. Open the latest GitHub Actions run in this repository.
2. Download the `bluemine-extension` artifact.
3. Extract the ZIP file locally.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode**.
6. Click **Load unpacked** and select the extracted folder.

### Option 2: Local development install

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder.

## Build Pipeline

GitHub Actions packages the extension as a ZIP artifact on push and manual trigger.
This is the initial distribution method before Chrome Web Store publishing.

## Contributing

- Use this project openly: feedback and contributions are welcome.
- Please submit feature requests in the [Issues](../../issues) tab.
- Please report bugs (and bugfix ideas) in the [Issues](../../issues) tab.

For planned AI and integration features, we aim to keep credentials user-provided and project-scoped for better security.

## License

Licensed under MIT. See `LICENSE`.
