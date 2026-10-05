# Rally2Rumble
Open index.html in a browser.
Public pages: index, signup, login. Sponsor Assistant (needs login or "Continue as guest"):
dashboard, find (ranked sponsors + add modal), sponsor (why this match), angle, draft, pipeline (drag and drop kanban + drawer), messages, settings.
- css/style.css  - styles (colour tokens at the top)
- java/java.js   - all page logic. Demo data lives in localStorage; swap for a real backend.
- assets/        - put logo.png here and replace the placeholder in login.html
To add a page: copy a small file such as messages.html, set data-page, add a P.<name> function in java.js.
