Link: https://osamaaayman.github.io/Wedding_QR_Sytem/
DO NOT USE WITHOUT MY PERMITION
# Wedding QR — Entrance Management System

A mobile-first web application for managing guest entry at wedding events using QR codes. Runs entirely in the browser, hosted on GitHub Pages, with a real-time Supabase database backend so multiple staff members at the door share the same live data.

---

## Project Structure

```
wedding-qr/
├── index.html   — Page structure and all HTML markup
├── style.css    — All visual styling and responsive layout
├── app.js       — All application logic and database calls
└── README.md    — This file
```

---

## Features

| Feature | Description |
|---|---|
| **Session login** | Create or join a named session with a shared password |
| **Live QR scanner** | Camera-based scanning using html5-qrcode (iPhone Safari + Android Chrome) |
| **Manual code entry** | Type or paste a code if the camera is unavailable |
| **Real-time sync** | Scans made on any device are instantly reflected on all others |
| **Code generation** | Generate any number of QR codes — new codes are always *appended*, never replace existing ones |
| **Per-code PDF** | Click any QR code or its "↓ PDF" button to download a single guest card |
| **Bulk PDF ZIP** | Download all codes as a ZIP of individual A5 PDF cards |
| **PIN protection** | The Generate and Manage pages are protected by a shared PIN (see Configuration) |
| **Manage page** | View all codes, filter by used/unused, reset individual codes, delete individual codes, or delete all |
| **Delete codes** | Remove single or all codes permanently from the database |

---

---

## How to Use on the Day

### The organiser (one person)

1. Open the website and tap **New Session**.
2. Enter an event name (e.g. `Sarah & Ahmed 2025`) and a shared password.
3. Tap **Generate** → enter the PIN → set the number of codes → tap **Add Codes**.
4. Download the ZIP. Extract it, then print or share each guest's PDF card.

### Door staff (all phones)

1. Open the same website URL.
2. Tap **Join Session** and enter the same event name and password.
3. Tap **Scanner** → allow camera access → point the camera at guest QR cards.
4. Green = ✓ WELCOME, Red = already used or invalid.

All three phones see the same scan count in real time.

---

## PIN System

Both the **Generate** and **Manage** pages are protected by a numeric PIN. When a staff member taps either tab, a full-screen keypad overlay appears and the page content underneath is inaccessible until the correct PIN is entered.

- The PIN is set in `app.js` as `PAGE_PIN`.
- Both pages share the same PIN.
- The PIN is reset (overlay re-shown) every time a user logs out.
- The PIN only needs to be entered once per login session per page.

**Current PIN: `24042`**

---

## PDF Card Layout

Each generated PDF is an A5 portrait card containing:

- Couple / event name (large, italic)
- QR code (large, centred, with gold border frame)
- Guest number (large, easy to read at a glance)
- The unique code string (small, for manual lookup)
- Instruction text
- Maker credit and contact number at the bottom

---

## Technology Stack

| Library / Service | Purpose |
|---|---|
| [Supabase](https://supabase.com) | PostgreSQL database + real-time WebSocket subscriptions |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | Camera-based QR scanning (iOS + Android) |
| [QRCode.js](https://github.com/davidshimjs/qrcodejs) | Client-side QR code image generation |
| [jsPDF](https://github.com/parallax/jsPDF) | PDF generation in the browser |
| [JSZip](https://stuk.github.io/jszip/) | ZIP file creation for bulk PDF download |
| GitHub Pages | Free static site hosting |

---

## Troubleshooting

**Scanner does not start on iPhone**
Make sure you are using **Safari** (not Chrome or Firefox) on iPhone. Safari is required for camera access on iOS.

**"Session not found" error when joining**
The session name must match exactly (not case-sensitive). If you created the session as `Sarah & Ahmed 2025`, join with the same spelling.

**Codes are not showing on another device after generating**
Check the sync bar at the top — it should show a green dot and "Live · synced". If it shows an error, refresh the page and rejoin the session.

**PDF download says 0%**
Make sure you have generated codes first. The "Download All ZIP" button is disabled until at least one batch of codes exists.

---

## Made By

Eng. Osama — Contact: 01033234374
