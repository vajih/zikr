# Zikr Circle — Web MVP


**Stack**: GitHub Pages (static) + Google Sheets + Apps Script Web App


## Setup
1. Create a Google Sheet with tabs and headers from the docs.
2. Open **Extensions → Apps Script**, paste **Code.gs**, deploy as **Web app** (Anyone), copy URL.
3. In `/assets/js/api.js`, set `API_BASE` to your Web App URL.
4. Run local dev (VS Code Live Server) or push to GitHub Pages.


## Notes
- MVP auth uses a per-user token stored in the `users` sheet. Replace with Firebase Auth later.
- Realtime uses polling every 1.5s. Replace with Supabase/Firebase later for websockets.
- Private by default; public explore page can come later.