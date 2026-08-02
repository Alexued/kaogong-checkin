# LAN APK Update Design

## Goal

Allow the Android application to discover, download, and install a newer APK from the currently configured local network server. Preserve GitHub Releases and browser download as fallbacks.

## Scope

- Extend the existing Node server with a read-only update metadata endpoint and APK file serving.
- Extend the existing update client to query both the LAN server and GitHub.
- Select the newest valid release, preferring LAN when versions are equal.
- Show the selected source in the settings update card.
- Keep the existing native Android download and installation plugin unchanged unless testing exposes a compatibility defect.

This change does not add APK upload, authentication, background installation, or silent installation.

## APK Discovery

At request time, the server scans the repository root for files matching:

```text
kaogong-checkin-v<major>.<minor>.<patch>.apk
```

Only three-part numeric semantic versions are valid. The server compares numeric version components and chooses the highest version. Invalid names are ignored.

The repository root is derived from the server source location. An optional `KGC_UPDATE_DIR` environment variable may override the directory for deployments that keep APKs elsewhere. The resolved file must remain inside the configured update directory.

## Server API

### `GET /api/update/latest`

When an APK is available, return HTTP 200 with UTF-8 JSON:

```json
{
  "version": "0.5.2",
  "name": "kaogong-checkin v0.5.2",
  "apkUrl": "http://192.168.1.5:8321/updates/kaogong-checkin-v0.5.2.apk",
  "pageUrl": "http://192.168.1.5:8321/updates/kaogong-checkin-v0.5.2.apk",
  "notes": "Local network update",
  "publishedAt": "2026-08-02T12:00:00.000Z",
  "source": "lan",
  "fileName": "kaogong-checkin-v0.5.2.apk",
  "size": 4382621
}
```

The download URL is constructed from the incoming request host so phones receive a reachable LAN address rather than `localhost`.

When no valid APK exists, return HTTP 404 with `{ "error": "no update APK available" }`. Unexpected filesystem errors return HTTP 500 without exposing filesystem paths.

### `GET /updates/:fileName`

Serve only a file that matches the approved APK naming convention and exists directly inside the update directory. Send the Android package MIME type, content length, and a download disposition. Reject invalid names and traversal attempts with HTTP 404.

Express handles range and streaming behavior through `res.download` or `res.sendFile`; the APK is never loaded fully into memory.

## Client Selection

The client obtains the configured server URL through the existing `getServerUrl()` API. Update checking starts the LAN request and GitHub request concurrently when a server URL is configured. Without a configured server, only GitHub is queried.

Each source succeeds or fails independently:

- If both return releases, choose the higher semantic version.
- If versions are equal, choose LAN.
- If only one source succeeds, use it.
- If neither succeeds, show the existing check failure state.
- If the selected release is not newer than `APP_VERSION`, show the latest-version state.

`ReleaseInfo` gains a `source: 'lan' | 'github'` field. GitHub history remains GitHub-only because the LAN server exposes only its latest APK.

## Download And Fallback

The selected LAN URL is passed to the existing native `AppUpdate` plugin, which already accepts HTTP and HTTPS URLs and reports DownloadManager progress.

The update card displays `局域网` or `GitHub` beside the discovered version. For a LAN release, the browser action opens the LAN APK URL. If a LAN download fails, the client performs one fresh GitHub latest-release lookup:

- When GitHub provides the same or a newer version with an APK, the retry action switches to that GitHub release.
- Otherwise the current LAN failure remains visible and the user can recheck after the server file is restored.

There is no automatic second download. This avoids surprising mobile-data use; the user explicitly starts the fallback download.

## Security And Compatibility

- Only valid APK basenames are served.
- Filesystem paths are never accepted from request parameters.
- Existing permissive CORS behavior remains unchanged for LAN WebView access.
- Android cleartext HTTP support remains governed by the existing Capacitor and Android configuration.
- The installer still requires the Android unknown-app-source permission and user confirmation.

## Testing

Server tests cover:

- selecting the highest valid APK version;
- ignoring malformed APK names;
- returning 404 when no APK exists;
- returning request-host-based metadata;
- downloading the selected APK;
- rejecting invalid and traversal-style file names.

Client tests or extracted pure-function tests cover:

- higher LAN version wins;
- higher GitHub version wins;
- equal versions prefer LAN;
- one failed source does not hide the other;
- both failed sources produce an error.

Integration verification covers TypeScript, Vite production build, server tests, Android build, and a real-phone LAN download using a temporary higher-version APK filename. The temporary APK is removed after testing, and no user application data is cleared.

## Delivery

The existing uncommitted version `0.5.1` update UI changes remain intact. Implementation and tests will be committed after verification and pushed to `origin/main`, as requested.
