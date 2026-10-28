# System settings — 0.1.4, 2026-10-28

UI settings is now **System** in the toolbar, sidebar, dialog and native menu
(Cmd+,). AI connection moved from separate toolbar/sidebar entries into System;
the existing provider/Hermes settings, credentials and history are retained.
Opening the connection drawer dismisses System, with focus returning to its entry
point on close. Settings drawers are kept mutually exclusive.

Appearance offers explicit **Light**, **Dark** and **System** radio choices with
sun, moon and monitor icons. The existing stored theme choice is preserved.
System follows device appearance changes, including existing diagram/editor theme
updates; mode changes retain the current map viewport. Keyboard selection and
focus states remain available. Motion and clone-storage options stay in System.

Focused browser and Electron checks cover all three icons/options, saved choices
after reload, simulated device light/dark changes, AI entry/close/focus, removed
standalone controls and 390px settings/drawer layout. The complete core checks
and desktop/browser verification receipts are kept in ignored `dist/qa/`.

Final checks passed: 1,046 core tests, zero failures and one optional Compiler API
skip; 474 generated outputs, 99 vendor assets, 840 package files and zero
architecture violations. All 13 desktop tests and strict terminal types pass.
Packaged System checks cover icons, explicit modes, device-following changes,
saved preference after reload, AI navigation and focus. Packaged panel/terminal
checks across 14 views and the built-in demo also pass with no page errors.
Browser 390px System/AI layout and all 22 diagram/security renders pass without
horizontal overflow. All 850 packaged-source comparisons match; archive checksums,
DMG/ZIP integrity and deep/strict ad-hoc code-signature verification pass.
The final application was opened with System visible and the user's Light
preference retained.

Apple Silicon development artifacts: `dist/packages/0.1.4/`. Ad-hoc signed and
not notarized; signing configuration is unchanged. No publication, deployment,
Intel build or real provider-key/model calls are part of this update.
