# Sign and notarize Onboarder for macOS

Onboarder's release builder already enables Developer ID signing, hardened
runtime and notarization. It refuses a distribution build when signing or
notarization credentials are missing. An ad-hoc signature is a development
signature; it cannot be converted into Apple's trust by changing a filename.

## 1. Activate an Apple Developer membership

Use an active Apple Developer Program team that can issue Developer ID
certificates. A free Apple Account is insufficient. The account holder can
create the certificate in Apple's Certificates, Identifiers & Profiles portal.

[Enrollment requirements and current regional pricing](https://developer.apple.com/programs/enroll/)
· [Apple's Developer ID certificate instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)

Complete enrollment, identity checks, agreements and any membership purchase
yourself in Apple's official flow. No private Apple account information belongs
in this repository, build logs or chat.

## 2. Install a Developer ID Application certificate

In Keychain Access, use Certificate Assistant to request a certificate from a
certificate authority and save the certificate signing request to disk. Upload
that request to Apple's certificate portal, selecting **Developer ID Application**.
Download the issued certificate and import it into the same login Keychain that
contains its private key. A development, self-signed or Mac App Store certificate
is not a replacement for Developer ID Application.

Verify the matching certificate and private key are available:

```sh
security find-identity -v -p codesigning
```

The result must contain a valid `Developer ID Application: … (TEAMID)` identity.
Keep the private key in Keychain. Do not put a certificate export, private key,
API key or password in Git.

## 3. Store notarization credentials in Keychain

On a Mac with Apple Command Line Tools, create a notarytool credential profile.
Replace the email and Team ID placeholders with the values from your team:

```sh
xcrun notarytool store-credentials Onboarder --apple-id you@example.com --team-id TEAMID
```

Enter the app-specific password at the tool's interactive prompt. Do not put it
on the command line or use your ordinary Apple Account password. The builder
also supports Apple's API-key credentials, but the Keychain profile avoids
placing secrets in shell commands or project files.

## 4. Build a fresh signed version

Use a new desktop version and versioned output directory. Preserve the existing
published development artifacts and their checksums; do not silently replace
them with different bytes under the same release filenames.

From `integrations/macos`, select the installed identity and saved profile:

```sh
export CSC_NAME='Developer ID Application: Your Name (TEAMID)'
export APPLE_KEYCHAIN_PROFILE=Onboarder
npm run package:release
```

The current default builds Apple Silicon only. Release mode requires signing
and notarization, keeps hardened runtime enabled, then runs deep/strict code
signature verification, Gatekeeper assessment and stapled-ticket validation.
Do not weaken these checks to produce a successful-looking build.

## 5. Verify and publish the new downloads

Run the desktop tests and source comparisons against the actual signed app.
Test launching from the downloaded archive on an interactive Mac, including
real Keychain access, shell/chat terminals, multiple project windows, exports
and the bundled Node/npm runtime. Unattended CI uses a mock Keychain and does
not replace this step.

Publish the new version with its checksums and build status only after Apple's
notarization has succeeded and Gatekeeper accepts the app. Then update website
download links and preview/notarization copy to match the actual new artifacts.

[Apple's notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
· [Desktop build and verification guide](../integrations/macos/README.md)
