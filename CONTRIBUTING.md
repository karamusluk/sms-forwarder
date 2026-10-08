# Contributing

Thanks for looking at SMS Forwarder. The app forwards incoming Android SMS to an email address the user verifies with a one-time code. Message text is not stored in the database.

## Setup

You need Node.js 22.11 or newer, the React Native Android environment, and a Supabase project of your own. Setup steps are in [README.md](README.md).

```sh
npm install
cp .env.example .env
npm test
npm run android
```

Fill `.env` locally. Do not commit it. SMTP passwords belong in Supabase secrets, not in the app.

`minSdk` stays 29. Android 10 must keep working.

## Pull requests

Open a pull request against `master`. The template asks what changed and how you tested it.

- JavaScript or TypeScript changes: run `npm test`.
- Native Kotlin, the manifest, or Gradle: run the app on Android 10 (API 29).
- Do not include `.env`, a release keystore, an SMTP password, or a Supabase service-role key.

There is no continuous integration job and no prebuilt APK in this repository. A release APK is built locally with `cd android && ./gradlew assembleRelease`.

## Reporting bugs

Use a GitHub issue. Leave out real SMS bodies, one-time codes, and email addresses. A redacted sender and the error text are enough.

Security reports follow [SECURITY.md](SECURITY.md).
