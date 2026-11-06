# Twenty CRM - LinkedIn Capture Extension

A Chrome extension to capture LinkedIn profiles and companies directly into your self-hosted [Twenty CRM](https://twenty.com).

---

## 📥 Download & Install

### Quick Install (Recommended)

1. **[⬇️ Download Latest Release](../../releases/latest)**
2. Download the `twenty-crm-linkedin-extension-*-chrome.zip` file
3. **Unzip** the file - you should see `manifest.json` and other files directly inside
4. Open Chrome → `chrome://extensions`
5. Enable **Developer mode** (toggle top right)
6. Click **Load unpacked** → select the **unzipped folder** (the one containing `manifest.json`)
7. In Twenty, go to **Settings → Developers** and create an API key
8. Click the extension icon, enter your Twenty CRM URL and paste the API key, then click **Save**

> **Note**: The extension authenticates with an API key, not your browser login. Twenty 2.x keeps its login session in an httpOnly cookie that extensions cannot use. Anyone using this browser profile can use the key, so give it a role with only the access the extension needs (read and write People and Companies, upload files).
>
> **Tip**: After unzipping, verify the folder contains `manifest.json` at the root level, not inside a subfolder.

---

## ✨ Features

| Feature                    | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| 🔗 **LinkedIn Capture**    | One-click capture of LinkedIn profiles to your CRM         |
| ➕ **Inline Button**       | "Add to Twenty" next to LinkedIn's "More" button          |
| 🏢 **Company Auto-Create** | Automatically creates company records when adding contacts |
| 📸 **Photo Upload**        | Uploads LinkedIn profile photos directly to Twenty storage |
| 🔍 **Duplicate Detection** | Checks if contact/company exists by LinkedIn URL or name   |
| 🌍 **Multi-language**      | Extracts company names in EN, FR, DE, ES headlines         |

---

## 🚀 Usage

### Capturing a LinkedIn Profile

1. Visit any LinkedIn profile (`linkedin.com/in/username`)
2. An **Add to Twenty** button appears next to LinkedIn's **More** button:

   | Button State       | Meaning                               |
   | ------------------ | ------------------------------------- |
   | **Add to Twenty**  | Profile not in CRM - click to add     |
   | **Open in Twenty** | Profile exists - click to view in CRM |

### Capturing a Company

Same process - visit any LinkedIn company page (`linkedin.com/company/name`)

---

## 📋 Data Captured

### People

- ✅ First name & Last name
- ✅ Job title / headline
- ✅ Profile photo (uploaded to Twenty)
- ✅ Location
- ✅ LinkedIn URL
- ✅ Current company (auto-created if needed)

### Companies

- ✅ Company name
- ✅ LinkedIn URL
- ✅ Website (when available)
- ✅ Employee count
- ✅ Company logo

---

## 🛠️ Build from Source

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/twenty-crm-extension.git
cd twenty-crm-extension

# Install dependencies
npm install

# Development with hot reload
npm run dev

# Build for production
npm run build

# Create distributable ZIP
npm run zip
```

The built extension is in `.output/chrome-mv3/`

---

## 🏷️ Creating a Release

**Option 1: Git Tag**

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Option 2: Manual**

1. Go to GitHub → Actions → "Build and Release Extension"
2. Click "Run workflow"
3. Enter version (e.g., `v1.0.0`)

GitHub Actions will automatically build and create a release with the ZIP file.

---

## 🔧 Requirements

- Chrome or Chromium-based browser
- Self-hosted Twenty CRM instance (tested with 2.54)
- A Twenty API key (Settings → Developers)

---

## ❓ Troubleshooting

| Issue                     | Solution                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| "Connection test failed"  | Check your Twenty URL and that the API key is valid and not expired  |
| Button not appearing      | Refresh the LinkedIn page, check extension is enabled                |
| Profile photo not showing | Check Twenty's file storage is configured                            |
| Company not created       | Headline may not have recognizable pattern (`at/chez/@/bei` Company) |

### Debug Logs

- **Page console** (F12): Shows scraping logs
- **Service Worker**: Go to `chrome://extensions` → click "Service Worker" under the extension

---

## 📚 Tech Stack

- [WXT](https://wxt.dev/) - Web Extension Framework
- [Vue 3](https://vuejs.org/) - Popup UI
- TypeScript
- Twenty CRM GraphQL API

---

## 📄 License

MIT

---

## 🔗 Links

- [Twenty CRM](https://twenty.com)
- [WXT Documentation](https://wxt.dev)
- [Report an Issue](../../issues)
