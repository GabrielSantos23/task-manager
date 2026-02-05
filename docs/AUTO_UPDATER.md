# Auto-Updater Setup

This document explains how to set up the auto-updater for Task Manager using GitHub Releases.

## Prerequisites

### 1. Generate Signing Keys

The Tauri updater requires signed updates for security. Generate a key pair using:

```bash
# In the src-tauri directory
npx @tauri-apps/cli signer generate -w ~/.tauri/task-manager.key
```

This will output a **public key** and create a private key file.

### 2. Configure the Public Key

Add the public key to `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/GabrielSantos23/task-manager/releases/latest/download/latest.json"
      ]
    }
  }
}
```

### 3. Set Up GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add:

| Secret Name                          | Value                                                          |
| ------------------------------------ | -------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of the private key file (~/.tauri/task-manager.key)   |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set when generating the key (leave empty if none) |

## Creating a Release

1. **Update the version** in `tauri.conf.json`:

   ```json
   {
     "version": "0.2.0"
   }
   ```

2. **Create and push a tag**:

   ```bash
   git add .
   git commit -m "Release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```

3. The GitHub Actions workflow will automatically:
   - Build the app for Windows and macOS
   - Sign the update artifacts
   - Create a GitHub Release with all installers
   - Upload `latest.json` for the auto-updater

## How It Works

1. When a user clicks the **download icon** in the header (or navigates to Settings), the app checks for updates
2. The app fetches `latest.json` from the GitHub Release
3. If a newer version is available, the user is prompted to update
4. Clicking "Update Now" downloads and installs the update automatically
5. The app relaunches with the new version

## Manual Build

To build a release locally (for testing):

```bash
cd apps/web
bun run desktop:build
```

The update artifacts will be in `apps/web/src-tauri/target/release/bundle/`.

## Troubleshooting

### "Update check failed"

- Ensure the app has internet access
- Check that the GitHub repository is public
- Verify the endpoint URL in `tauri.conf.json`

### "Signature verification failed"

- Ensure the public key in `tauri.conf.json` matches the private key used for signing
- Check that `TAURI_SIGNING_PRIVATE_KEY` is set correctly in GitHub Secrets

### No `latest.json` in release

- Ensure `createUpdaterArtifacts: true` is set in `tauri.conf.json` under `bundle`
- The workflow must complete successfully to upload artifacts
