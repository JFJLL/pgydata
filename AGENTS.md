# Project Agent Notes

Read and obey `C:\Users\liuhao_PC\.codex\RTK.md`.

Windows hard rules for `rtk`:
- Only use `rtk <program> ...` for real executables available on PATH or by absolute path.
- Never run shell built-ins, PowerShell cmdlets, aliases, or pipeline fragments directly as `rtk <thing>`.
- For `Get-ChildItem`, `Get-Content`, `Select-Object`, `Where-Object`, `type`, `dir`, variable assignment, pipelines, or process control, always use `rtk pwsh -NoProfile -Command '...'`.
- When using `-Command`, use single quotes around the whole PowerShell payload and double quotes inside it.

## Current Project Summary

- Project name: `magiorix`.
- Desktop app package name: `magiorix-desktop`.
- Current released Windows version: `1.1.0`.
- Main branch: `master`.
- GitHub remote: `git@github.com:JFJLL/pgydata.git`.
- The old names `zs`, `@zsdesktop`, `PYGdata`, and legacy Emagic/PYG branding should not be reintroduced.
- Windows installer is built with NSIS.
- Official release artifacts are generated under `desktop-versions/windows/<version>/`, but `desktop-versions/` is ignored by git.
- Large runtime artifacts are tracked with Git LFS, including `runtime/magiorix-desktop/resources/app.asar`.

## Important Local Paths

- Repo root: `D:\download\pic-vec\pgydata`
- Windows runtime: `runtime/magiorix-desktop`
- Electron source: `app-source`
- Frontend assets in repo: `assets/<version>`
- Backend/server project in repo: `red-magic-api`
- Server asset zip in repo: `red-magic-api/public/assets/desktop/<version>/assets.zip`
- Windows build script: `scripts/build-magiorix-windows-installer.ps1`
- Frontend patch script: `scripts/apply-magiorix-frontend-patches.js`
- Runtime patch script: `scripts/apply-magiorix-runtime-patches.js`
- Official logo source: `D:\download\pic-vec\pgydata\red-magic-api\public\emagic-logo.png`

## Current 1.1.0 Release Facts

- Merged feature branch/worktree: `codex/starmap-menu`.
- Feature added: Douyin section with Starmap homepage collection menu.
- Related commits:
  - `607cffe feat: show douyin starmap menu`
  - `722c880 style: enlarge primary sidebar icons`
  - `7712e4f chore: release magiorix 1.1.0`
- Current installer:
  - `D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.0\magiorix-desktop-1.1.0-windows.exe`
  - SHA256: `DCCDEDE631AFA75A45FC7A001BBEA6D46FCB456DAD5FEB3C4E9F11861E7A282D`
- Current assets zip:
  - `D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.0\magiorix-desktop-1.1.0-assets.zip`
  - SHA256: `5BEB66392ABDDB1D879E7A520F39A90CE96DADD8EE484B131163171E2A61E08D`

## Version Bump Rules

- Patch version, for example `1.1.1`: bug fixes, log fixes, small download page fixes, packaging-only fixes.
- Minor version, for example `1.2.0`: new visible features or new platform/menu modules.
- Major version, for example `2.0.0`: incompatible data, install, server API, or workflow changes.
- If a feature is merged into `master` and will be given to colleagues, bump the release version before building.

When bumping a Windows release version, update all of these:
- `app-source/package.json`: `version` and `assetsVersion`.
- `app-source/package-lock.json`: root package `version` fields.
- `scripts/build-magiorix-windows-installer.ps1`: `$version`.
- `scripts/apply-magiorix-frontend-patches.js`: `assetVersion`.
- `red-magic-api/server.js`: `ASSET_VERSION`, `INSTALLER_FILE_NAME`, `INSTALLER_DOWNLOAD_URL`, and any returned latest version values.
- `red-magic-api/public/index.html`: fallback download URL and fallback displayed version.
- Rename/copy `assets/<old-version>` to `assets/<new-version>`.
- Rename/copy `red-magic-api/public/assets/desktop/<old-version>` to `red-magic-api/public/assets/desktop/<new-version>`.

## Windows Release Build Flow

From repo root:

```powershell
rtk pwsh -NoProfile -Command '& "D:\download\pic-vec\pgydata\scripts\build-magiorix-windows-installer.ps1"'
```

The build script should:
- Apply frontend patches.
- Generate `assets/<version>/integrity-manifest.json`.
- Rebuild `desktop-versions/windows/<version>/magiorix-desktop-<version>-assets.zip`.
- Sync `red-magic-api/public/assets/desktop/<version>/assets.zip`.
- Apply runtime patches.
- Repack `runtime/magiorix-desktop/resources/app.asar`.
- Build `desktop-versions/windows/<version>/magiorix-desktop-<version>-windows.exe`.
- Generate `.sha256.txt` and `release-info.json` in the release directory.

After building, verify at minimum:

```powershell
rtk node --check red-magic-api/server.js
rtk node --check scripts/apply-magiorix-frontend-patches.js
rtk node --check scripts/apply-magiorix-runtime-patches.js
rtk pwsh -NoProfile -Command 'Get-Item -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe"; Get-FileHash -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe" -Algorithm SHA256'
```

## Server Deployment Layout

Production server project path:

```text
/home/red/work/moneyboost/red-magic-api
```

Expected server layout:

```text
red-magic-api/
├── data/
│   └── red-magic-api.sqlite
├── public/
│   ├── admin/
│   │   └── index.html
│   ├── assets/
│   │   ├── desktop/
│   │   │   └── <version>/
│   │   │       └── assets.zip
│   │   ├── guide-authorizing.png
│   │   ├── guide-login.png
│   │   ├── magiorix-logo.png
│   │   └── software-screenshot.png
│   ├── emagic-logo.png
│   └── index.html
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

Do not overwrite or delete:
- `data/red-magic-api.sqlite`
- server `.env` if present
- server logs
- any production-only backup files

## What To Upload For A Release

Upload the Windows installer to OSS:

```text
https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-<version>-windows.exe
```

Upload/update these files on the server:

```text
/home/red/work/moneyboost/red-magic-api/server.js
/home/red/work/moneyboost/red-magic-api/public/index.html
/home/red/work/moneyboost/red-magic-api/public/assets/desktop/<version>/assets.zip
```

Usually also keep these static files in sync if changed:

```text
/home/red/work/moneyboost/red-magic-api/public/assets/magiorix-logo.png
/home/red/work/moneyboost/red-magic-api/public/assets/software-screenshot.png
/home/red/work/moneyboost/red-magic-api/public/emagic-logo.png
```

After uploading:
- Restart the backend process, for example `pm2 restart red-magic-api` if PM2 is used.
- Verify `/api/desktop-download/latest` returns the new version and installer URL.
- Verify `/api/frontend-assets/latest/desktop` returns the new `assets.zip` version.
- Open the public download page and confirm it shows only the version, not file size.

Old server files that can be removed after backup when no longer needed:
- `public/assets/desktop/<old-version>/`
- `public/downloads/EmagicDataCrawler-Setup.exe`
- root `downloads/EmagicDataCrawler-Setup.exe`

## Git Flow

- Prefer feature branches/worktrees for feature work.
- Merge feature branches into `master` only after checking the diff and confirming the worktree is clean.
- If the merge represents a release, create a separate release/version commit after the feature commits.
- Push `master` to GitHub after successful local build and verification.
- `desktop-versions/` is local release output and should not be committed.
- `red-magic-api/data/`, `red-magic-api/logs/`, and `node_modules/` should stay ignored.

Useful commands:

```powershell
rtk git status -sb
rtk git log -4 --oneline
rtk git push origin master
```

GitHub push may time out while uploading Git LFS objects. If LFS upload completes but the connection closes before updating the branch, check:

```powershell
rtk pwsh -NoProfile -Command 'git status -sb; git ls-remote origin refs/heads/master'
```

Then retry:

```powershell
rtk git push origin master
```

## Runtime And Logs

- App user data/log directory is under `%APPDATA%\magiorix-desktop`.
- Main process logs use Beijing time after the logging fix.
- The unused Scheduler cloud sync is disabled; logs should show `采集调度器云端同步已关闭` instead of repeated `/api/scraping-tasks` 404 failures.
- If the installed app still shows old log behavior, reinstall the newest generated installer because the installed `app.asar` may still be old.

## Current Server API Notes

- `red-magic-api/server.js` controls:
  - desktop installer latest metadata: `/api/desktop-download/latest`
  - frontend desktop assets metadata: `/api/frontend-assets/latest/desktop`
  - desktop update check: `/api/desktop-versions/check`
- The public landing page intentionally does not show installer size because the installer is stored on OSS, not necessarily on the server filesystem.

## Safety Notes

- Do not commit production database files.
- Do not commit cookies, tokens, API keys, or real credentials.
- Do not reintroduce old package or folder names containing `zs`.
- Do not delete user-created worktrees unless explicitly asked.
- Before destructive file operations, verify the absolute target path is inside the intended project or archive directory.
