import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import MakerAppImage from '@reforged/maker-appimage';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Force a stable lowercase executable name on every OS so the AppImage
    // maker's `bin` matches the packaged binary (it defaults to the capitalized
    // product name otherwise → "Could not find executable 'dogwalker'").
    executableName: 'dogwalker',
    // App/program icon (from assets/logo.svg via tools/gen-icons.mjs). Packager
    // appends .ico on Windows and .icns on macOS; Linux icons come from the makers.
    icon: 'assets/icons/icon',
    // Ship the PNG as a runtime resource so the window/notification can load it
    // (the OS taskbar/dock icon already comes from `icon` above).
    extraResource: ['assets/icons/icon.png'],
  },
  // node-pty is N-API with bundled prebuilds (prebuilds/<platform>-<arch>),
  // so no electron-rebuild pass is needed — and requiring one would demand
  // native build tools on every dev machine.
  rebuildConfig: { onlyModules: [] },
  // Per-OS installers (PRODUCT.md §13, ROADMAP v0.8). Forge only runs makers
  // whose platform matches the host, so a given OS's CI job produces its own
  // artifact: Windows → Squirrel .exe, macOS → .dmg (+ .zip), Linux → .deb /
  // .rpm / AppImage.
  makers: [
    new MakerSquirrel({ setupIcon: 'assets/icons/icon.ico' }),
    new MakerDMG({ icon: 'assets/icons/icon.icns' }, ['darwin']),
    // ZIPs: macOS (Squirrel.Mac auto-update feed) + Windows (portable, for Scoop).
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerRpm({ options: { icon: 'assets/icons/icon.png' } }),
    new MakerDeb({ options: { icon: 'assets/icons/icon.png' } }),
    new MakerAppImage({ options: { bin: 'dogwalker', icon: 'assets/icons/icon.png' } }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
