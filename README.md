# KIWA

Keep Improving With AI. 
A mobile app for building, studying and sharing courses, standalone quizzes and flashcards.
Everything is stored on the device. There is no backend.

Built with Expo (React Native) and TypeScript.

## Run it

```bash
npm install
```

```bash
npm start
```

Then press `i` for the iOS simulator, `a` for Android, or `w` for the browser.

## Check it

```bash
npm run check
```

This runs the linter, the type checker and the tests. CI runs the same three on every pull request.

## End-to-end checks

`e2e/` holds browser checks that walk through the app as a user would, against the web build.
They need Playwright with Chromium available to Node, which is not a dependency of this project.

```bash
npm run e2e
```

Screenshots and downloaded files land in `e2e/.output/`.

## How the code is organised

| Folder | What lives there | May import |
| --- | --- | --- |
| `src/core` | The file format, grading, attempt logic, templates. Plain TypeScript, no React or Expo. | nothing else in `src` |
| `src/data` | SQLite schema, migrations and repositories. | `core` |
| `src/ui` | Theme and shared components. | — |
| `src/platform` | File picking, sharing and clipboard. The only place device file APIs are called. | `core` |
| `src/features` | Behaviour shared by several screens. | `core`, `data`, `ui`, `platform` |
| `src/app` | Screens. One file per route (Expo Router). | everything |
| `src/i18n` | Strings. `en.ts` is the source of truth. | — |

A lint rule keeps `src/core` free of UI and device imports, so its tests run in about a second.

## The file format

A file holds one course, quiz or flashcard deck. The `format` field says which:
`course/1`, `quiz/1` or `deck/1`. The schema is defined once, in `src/core/schema`, and is used
to validate stored and imported content and to produce JSON Schema for AI prompts.

`src/core/templates/samples.ts` contains one complete example of each kind.

Content and personal state are stored separately. Favorites, bookmarks and completion marks
point at content by id, so replacing a course with a newer version keeps them.

## Import, export and prompts

Everything that reads or writes a file lives in `src/core/transfer`:

- `extract.ts` finds the JSON in a chatbot reply, with or without a code fence around it, and undoes what copying from a chat app can do to it (JSON escaped into a string, Markdown escapes, non-breaking spaces).
- `repair.ts` corrects common slips before validation (a missing `format`, missing or repeated
  ids, an answer written as text) and reports each correction so the user sees what changed.
- `files.ts` reads imports and writes exports. Besides the three document formats there is
  `lesson/1` for a single lesson and `backup/1` for everything on the device.
- `prompt.ts` builds the prompt a user pastes into any chatbot, and the follow-up prompt for a
  reply that failed validation. Both are generated from the same schema the importer checks.

A backup holds content, marks, results and settings. API keys are never part of it.

## Question types

A question type has three parts: its schema in `src/core/schema/questions.ts`, its answer shape and
grading in `src/core/quiz`, and its view in `src/features/study/question-views.tsx`. The player,
results and attempts work with any type that has all three.

Lesson text uses a small subset of Markdown, listed at the top of `src/core/markdown.ts`.

## Database changes

Add a new entry to the end of `migrations` in `src/data/migrations.ts`. Never edit an entry that
has shipped. The repository tests run against a real in-memory SQLite, so a migration and the
queries that depend on it are checked together.

## Release

Builds run on EAS (project `1294d049-…` in `app.json`). `eas.json` has two profiles: `preview` for
installing on test phones (an APK on Android) and `production` for the stores.

```bash
npx eas-cli@latest build --profile preview --platform android
```

Build numbers (Android `versionCode`) are kept on EAS (`appVersionSource: remote`) and go up by one
with every build, so each new APK installs over the previous one. The `versionCode` in `app.json`
only seeded that counter. The version people see is `version` in `app.json`; raise it before a
release.

### Android APK on GitHub

The project page's **Download for Android** button links to
`https://github.com/handsomestranger56-prog/kiwa/releases/latest/download/kiwa.apk`, the `kiwa.apk`
asset of the newest release. The **Release Android APK** workflow builds the APK on EAS and publishes
that release. To publish a version:

1. Set `version` in `app.json` (for example `0.2.0`) and merge it to `main`.
2. Push a matching tag: `git tag v0.2.0 && git push origin v0.2.0`. Or open
   **Actions → Release Android APK → Run workflow** and type the tag there.

The run starts an EAS build of the `preview` profile, waits for it (the free plan's queue can take a
while), checks the file is an APK and creates the release with it. Each run uses one of the free
plan's 15 Android builds a month, so it does not run on every push. To publish an APK you already
built, paste its expo.dev download link in the workflow's **apk_url** box and no new build starts.

One-time setup: the workflow signs in to EAS with an access token.

1. On expo.dev, open **Account settings → Access tokens** and create a token (a robot user token is
   best, since it can only build). Copy it.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**, name it
   `EXPO_TOKEN` and paste the token.

You can also create the release by hand on the Releases page: attach the file named exactly
`kiwa.apk`, and leave **Set as a pre-release** off, because `latest` skips drafts and pre-releases.
The link works for everyone only while the repository is public.

Before a store build, decide and fill in:

- **The app's name** is KIWA (Keep Improving With AI). Check the stores for clashes before release.
- **Identifiers**: `ios.bundleIdentifier` and `android.package` in `app.json`, for example
  `com.yourname.studyapp`. They cannot change after the first release.
- **Icons and splash** are drawn from the KIWA mark by `node tools/make-icons.js`. The iOS icon is an
  Icon Composer bundle, `assets/kiwa.icon`.
- **A privacy policy.** The app stores everything on the phone, but it sends text to the AI providers
  the user adds. Both stores ask for a policy that says so.

Everything the app uses is available in Expo Go, so a development build is not needed to try it.

## Accessibility

`e2e/a11y.js` runs the axe engine on every main screen and fails on serious or critical problems.
Toggle buttons expose their state as `aria-pressed` on the web and as "selected" on phones, and
every drag interaction has a tap alternative.

## Web

The browser build is a development convenience. SQLite on the web needs cross-origin isolation,
which `metro.config.js` sets up for the dev server.
