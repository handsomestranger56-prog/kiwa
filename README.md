# anki

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

## How the code is organised

| Folder | What lives there | May import |
| --- | --- | --- |
| `src/core` | The file format, grading, attempt logic, templates. Plain TypeScript, no React or Expo. | nothing else in `src` |
| `src/data` | SQLite schema, migrations and repositories. | `core` |
| `src/ui` | Theme and shared components. | — |
| `src/features` | Behaviour shared by several screens. | `core`, `data`, `ui` |
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

## Question types

A question type has three parts: its schema in `src/core/schema/questions.ts`, its answer shape and
grading in `src/core/quiz`, and its view in `src/features/study/question-views.tsx`. The player,
results and attempts work with any type that has all three.

Lesson text uses a small subset of Markdown, listed at the top of `src/core/markdown.ts`.

## Database changes

Add a new entry to the end of `migrations` in `src/data/migrations.ts`. Never edit an entry that
has shipped. The repository tests run against a real in-memory SQLite, so a migration and the
queries that depend on it are checked together.

## Web

The browser build is a development convenience. SQLite on the web needs cross-origin isolation,
which `metro.config.js` sets up for the dev server.
