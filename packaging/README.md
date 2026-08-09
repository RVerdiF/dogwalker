# Packaging & distribution

Dogwalker ships **unsigned** installers on [GitHub Releases](https://github.com/caribeedu/dogwalker/releases)
(built by the `v*` tag workflow). This folder holds the package-manager manifests
for the channels we support. None of these require code signing.

## Auto-update (already wired)

Packaged **Windows and macOS** builds check for updates on launch via the free
[`update.electronjs.org`](https://update.electronjs.org) service (see
`updateElectronApp` in `src/main.ts`), pulling from this repo's public Releases.
No server to run. Notes:

- **Windows (Squirrel)** updates even while unsigned.
- **macOS** can only *apply* updates once the app is signed & notarized
  (Squirrel.Mac requirement) — until then it's a no-op with a log line.
- **Linux** isn't supported by the service; users update through the package
  manager below or by downloading the new artifact.

## Automated by CI (v1.5.2+)

The `publish-packaging` job in `.github/workflows/build.yml` runs after the tag
build attaches every OS's installers to the Release. It downloads the artifacts,
computes their `sha256`, and updates each channel to the new version — using the
manifests in this folder as templates. **Each channel is skipped unless its secret
is set**, so the job is a green no-op until you finish the one-time setup below.

### One-time setup

1. **Create the channel repos** (public), matching the names the workflow uses:
   - `caribeedu/homebrew-dogwalker` — the cask lands at `Casks/dogwalker.rb`.
   - `caribeedu/scoop-bucket` — the manifest lands at `bucket/dogwalker.json`.
   - The AUR package `dogwalker-bin` (see the AUR section for the account + SSH key).
2. **Add repo secrets** to `caribeedu/dogwalker` (Settings → Secrets → Actions):
   - `PACKAGING_TOKEN` — a PAT with **contents:write** on `homebrew-dogwalker` and
     `scoop-bucket` (fine-grained scoped to those two repos, or a classic `repo`
     token). Enables the Homebrew + Scoop pushes.
   - `AUR_SSH_PRIVATE_KEY`, `AUR_USERNAME`, `AUR_EMAIL` — enables the AUR publish.

Once set, every `v*` tag auto-bumps the configured channels. Users still install
with the commands in each section below; you don't touch the manifests per release.

> The AUR step uses `KSXGitHub/github-actions-deploy-aur` — pin/verify its version
> when you enable it.

## Channels

The manifests here are the source templates the CI job stamps (version + hashes).

### Homebrew cask — macOS (`homebrew/dogwalker.rb`)

```bash
brew tap caribeedu/dogwalker
brew install --cask dogwalker
```

The DMG is arm64-only (that's what CI builds). Manual bump if ever needed:
`shasum -a 256 Dogwalker-<version>-arm64.dmg`, then set `version` + `sha256`.

### Scoop — Windows (`scoop/dogwalker.json`)

Consumes the **portable Windows zip** (`MakerZIP` for `win32`).

```bash
scoop bucket add dogwalker https://github.com/caribeedu/scoop-bucket
scoop install dogwalker
```

**Verify once** that the zip puts `dogwalker.exe` at the extract root; if it nests
under a folder, add `"extract_dir": "Dogwalker-win32-x64"` to the manifest.

### AUR — Arch Linux (`aur/PKGBUILD`)

Repackages the official `.deb` as `dogwalker-bin`. One-time: create an AUR account,
register your SSH public key, and claim the package name:

```bash
git clone ssh://aur@aur.archlinux.org/dogwalker-bin.git
# copy PKGBUILD in, then:
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO && git commit && git push
```

After that first push, the CI job keeps it current (it stamps `pkgver`/`sha256sums`
and publishes via the deploy action).

```bash
yay -S dogwalker-bin   # or any AUR helper
```

## Later (deferred, see ROADMAP notes)

winget / Chocolatey (moderation + per-release PRs), a signed apt repo (GPG +
hosting), and Snap/Flatpak (sandbox conflicts with spawning terminals) remain
deferred.
