# Packaging & distribution

Dogwalker ships **unsigned** installers on [GitHub Releases](https://github.com/caribeedu/dogwalker/releases)
(built by the `v*` tag workflow). This folder holds the package-manager manifests
for the channels we support, plus setup notes. None of these require code signing.

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

## Channels

Each manifest points at the versioned Release artifacts. Per release, bump the
version and (where required) the artifact's `sha256`.

### Homebrew cask — macOS (`homebrew/dogwalker.rb`)

One-time: create a public repo **`caribeedu/homebrew-dogwalker`** and put the
cask at `Casks/dogwalker.rb`. Then:

```bash
brew tap caribeedu/dogwalker
brew install --cask dogwalker
```

Per release: set `version` and `sha256` (`shasum -a 256 Dogwalker-<version>-arm64.dmg`),
or run `brew bump-cask-pr` in the tap. The DMG is arm64-only (that's what CI builds).

### Scoop — Windows (`scoop/dogwalker.json`)

Consumes the **portable Windows zip** (`MakerZIP` for `win32`, added in v1.5.0).
One-time: create a bucket repo **`caribeedu/scoop-bucket`** and drop the manifest
in it. Then:

```bash
scoop bucket add dogwalker https://github.com/caribeedu/scoop-bucket
scoop install dogwalker
```

Per release: `checkver`/`autoupdate` let the bucket's `checkver.ps1 -Update` (or
the Excavator bot) refresh `version` + `hash` automatically. **Verify once** that
the zip's internal layout puts `dogwalker.exe` at the extract root; if it nests
under a folder, add `"extract_dir": "Dogwalker-win32-x64"` to the manifest.

### AUR — Arch Linux (`aur/PKGBUILD`)

Repackages the official `.deb`. One-time: push to the AUR as **`dogwalker-bin`**
(needs an AUR account + SSH key):

```bash
git clone ssh://aur@aur.archlinux.org/dogwalker-bin.git
# copy PKGBUILD in, then:
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO && git commit && git push
```

Per release: bump `pkgver`, regenerate `.SRCINFO`, push.

## Later (deferred, see ROADMAP notes)

winget / Chocolatey (moderation + per-release PRs), a signed apt repo (GPG +
hosting), and Snap/Flatpak (sandbox conflicts with spawning terminals) are
deferred. CI auto-publishing to the tap/bucket/AUR can be added once those repos
and their secrets exist.
