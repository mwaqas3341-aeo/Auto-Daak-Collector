# Google setup (own Google account, OAuth)

1. In Google Cloud Console create a project. Enable the **Google Sheets API** and **Google Drive API**.
2. Auth Platform -> **Branding**: app name, user support email, developer contact email. Save. (Logo, home page, privacy and terms links are optional.)
3. **Audience**: user type External. Add your own account under Test users. Publish the app to *In production* if available; in *Testing* the refresh token expires after 7 days.
4. **Clients**: create an OAuth client ID of type Web application. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
5. Open https://developers.google.com/oauthplayground
   - Gear icon -> tick *Use your own OAuth credentials* -> enter client ID and secret.
   - Step 1: enter scope `https://www.googleapis.com/auth/spreadsheets.readonly` -> Authorize APIs (click through the unverified-app warning: Advanced -> Go to the app).
   - Step 2: Exchange authorization code for tokens -> copy the **refresh token**.
6. In Supabase (Edge Functions -> Secrets) set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_READ_REFRESH_TOKEN`.

## Notes
- Do not paste the client secret or refresh token into chat, issues or commits.
- If the app stays in Testing, replace `GOOGLE_READ_REFRESH_TOKEN` every 7 days.
- The reader can only open sheets the connected Google account can access.
