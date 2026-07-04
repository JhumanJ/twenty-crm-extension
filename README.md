# Twenty CRM - LinkedIn Capture Extension

A browser extension that captures LinkedIn profiles and companies into a self-hosted [Twenty CRM](https://twenty.com) instance. Built with [WXT](https://wxt.dev/) and Vue 3.

## Features

| Feature | Description |
| --- | --- |
| LinkedIn capture | One-click capture of LinkedIn profiles and companies into Twenty |
| Company auto-create | Creates the contact's current company if it does not already exist |
| Duplicate detection | Checks for an existing record by LinkedIn URL or name before creating |
| Update existing | Refreshes an existing CRM record with the latest LinkedIn data |
| Manual linking | Searches the CRM and links a LinkedIn profile to an existing record |
| Resilient scraping | Extracts data using structural anchors that tolerate LinkedIn UI changes |
| Schema-tolerant writes | Adapts to differences in the target Twenty schema across versions |

## Installation

1. Download the latest `*-chrome.zip` from the [Releases page](../../releases/latest).
2. Unzip it. The folder should contain `manifest.json` at its root.
3. Open `chrome://extensions` and enable **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.

For Firefox, load the `*-firefox.zip` build via `about:debugging`.

## Configuration

1. In Twenty, open **Settings → Developers** and create an API key.
2. Click the extension icon and enter:
   - **Twenty URL** — the base URL of your instance (for example, `https://crm.example.com`).
   - **API key** — the key created above.
3. Click **Save**, then **Test Connection**. The status should read **Connected**.

The API key is stored only in the browser's local extension storage and is sent
as a bearer token with each request.

If your Twenty instance sits behind an authenticating reverse proxy, keep a
logged-in browser session to that domain so requests pass the gateway.

## Usage

### Profiles

1. Open any LinkedIn profile (`linkedin.com/in/...`).
2. A button appears in the bottom-left corner:
   - **Add to Twenty** — the profile is not yet in the CRM; click to create it.
   - **Open in Twenty** — the profile already exists; click to view it.
3. Use the `...` menu for more actions:
   - **Link to existing contact** — search the CRM and link to an existing record.
   - **Update from LinkedIn** — refresh the existing record with current data.

### Companies

The same flow applies on any LinkedIn company page (`linkedin.com/company/...`).

## Data captured

**People:** first and last name, job title / headline, location, LinkedIn URL,
current company (created automatically when needed), and profile photo URL.

**Companies:** name, LinkedIn URL, website, and employee count when available.

Optional fields are only sent when present, and the extension adapts to the
fields the target Twenty schema actually exposes.

## Build from source

```bash
git clone https://github.com/pi3ch/twenty-crm-extension.git
cd twenty-crm-extension
npm install

npm run dev      # development build with hot reload
npm run build    # production build (output in .output/chrome-mv3/)
npm run zip      # packaged distributable
```

## Troubleshooting

| Issue | Suggestion |
| --- | --- |
| Connection test fails | Verify the Twenty URL and API key, and that the API key is active |
| Button not appearing | Reload the LinkedIn page and confirm the extension is enabled |
| A field is not captured | Open the page console; the scraper logs the values it extracts |

Debug logs:

- **Page console** (F12): content-script and scraping logs.
- **Service worker**: `chrome://extensions` → the extension's "Service worker" link, for API request logs.

## Tech stack

- [WXT](https://wxt.dev/) — web extension framework
- [Vue 3](https://vuejs.org/) — popup UI
- TypeScript
- Twenty CRM GraphQL API

## Credits

This project is a fork of [JhumanJ/twenty-crm-extension](https://github.com/JhumanJ/twenty-crm-extension). Thanks to the original author for the foundation this builds on.

## License

MIT
