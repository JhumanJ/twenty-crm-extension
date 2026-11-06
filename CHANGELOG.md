# Changelog

All notable changes to Twenty CRM LinkedIn Capture Extension.

## [1.1.0] - 2026-11-06

### ✨ Features

- **Inline Button** - An "Add to Twenty" button next to LinkedIn's "More" button on profiles and company pages, built as a copy of LinkedIn's own button so it looks exactly like it. It reads "Add to Twenty" for new records and "Open in Twenty" for existing ones

- **Works with any workspace** - Writes only the standard fields of a default Twenty workspace, and only those the workspace still has (it reads the schema first). Values without a field, such as location when `city` is turned off, or industry, are saved as "Key: Value" lines in a "From LinkedIn" note on the record. Without Notes they are dropped. If a create is still rejected, it is retried with just the name and LinkedIn URL, so a capture is never lost

### 🗑️ Removed

- The floating button in the bottom-left corner, with its menu ("Link to existing contact", "Update from LinkedIn"). Toast messages still appear there

### 🐛 Bug Fixes

- Fixed scraping on LinkedIn's redesigned profile and company pages, which use hashed class names: name, headline, current company, location and photo are now read from the page structure
- Profile and company URLs are saved without subpages such as `/home/`
- Companies and people now match on the exact name only (case-insensitive), so "Meta" no longer matches "Metabase"
- Employee counts such as "10K+ employees" were saved as 10

- Fixed "Not logged in" and "Connection test failed" on Twenty 2.x: Twenty no longer writes the readable `tokenPair` cookie, so the extension never found a session
- Fixed the connection test, which queried `currentWorkspace` on `/graphql` (it is only served on `/metadata` now)
- Fixed profile photo upload: the `uploadImage` mutation was removed from Twenty

### 🔧 Technical

- Authentication now uses a Twenty API key entered in the popup, stored in local (not synced) extension storage
- Profile photos use Twenty's three-step upload (`createFileUpload`, PUT, `completeFileUpload`) and are saved to the person's `avatarFile` field
- Dropped the `cookies` permission

## [1.0.0] - 2024-12-17

### ✨ Features

- **LinkedIn Profile Capture** - One-click capture of LinkedIn profiles to Twenty CRM
- **Company Page Capture** - Capture LinkedIn company pages
- **Auto Company Creation** - Automatically creates company records when adding contacts
- **Profile Photo Upload** - Uploads LinkedIn profile photos to Twenty's storage via GraphQL
- **Duplicate Detection** - Checks for existing records by LinkedIn URL and name matching
- **Manual Linking** - Search CRM and link LinkedIn profile to existing contacts
- **Update from LinkedIn** - Refresh existing CRM records with current LinkedIn data
- **Multi-language Support** - Extracts company names from headlines in multiple languages:
  - English: "at Company"
  - French: "chez Company", "à Company"
  - German: "bei Company"
  - Spanish: "en Company"
  - Symbol: "@ Company"

### 🔧 Technical

- Session-based authentication using Twenty's existing login cookie
- GraphQL API integration for all CRM operations
- GraphQL multipart upload for profile photos
- Floating UI button with status indicators
- Menu dropdown for additional actions
- URL change detection for LinkedIn SPA navigation

### 📋 Data Captured

**People:**

- First name & Last name
- Job title / headline
- Profile photo (uploaded)
- Location
- LinkedIn URL
- Current company (linked or created)

**Companies:**

- Company name
- LinkedIn URL
- Website
- Employee count
