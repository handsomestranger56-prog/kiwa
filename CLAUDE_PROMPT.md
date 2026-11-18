# Handoff prompt

Paste everything below the line into a new chat that has this repository attached, to continue the
work where it stopped. It is written to the assistant picking the work up.

---

You are continuing the build of a mobile app in this repository. All nine planned steps are
built and pushed. What is left is testing on real phones and the store decisions listed under
"What remains". Read this file fully, then `README.md` and `AGENTS.md`, before changing anything.

## The plan and where it lives

- The agreed architecture and nine-step plan is a published page:
  https://claude.ai/artifact/HW1qUoT5fYYEcT5XWepTJo
- The same page is saved in this repository at `docs/course-app-blueprint.html`, in case the link
  cannot be opened from your session. It is the page source without an HTML skeleton.
- Each plan step on the page carries a "Built" tag once finished. If you can update the page, add
  the tag when you finish a step. If you cannot, say so and carry on.

## What the app is

A mobile app for building, studying and sharing courses, standalone quizzes and flashcard decks.
Local first: everything is stored on the device, there is no backend, and the only network calls
will go from the phone straight to an AI provider the user adds with their own key.

Built with Expo SDK 58 (React Native 0.88, React 19, TypeScript 6), Expo Router, SQLite and Zod.

## Decisions already made with the user

Do not reopen these. They were discussed and settled.

1. Expo with React Native and TypeScript.
2. No backend, no accounts, no cloud sync.
3. One schema drives everything: validation, import, JSON Schema for prompts and model output.
4. Three kinds of library item: course, standalone quiz, flashcard deck. Each can be created,
   generated, imported and exported on its own. A lesson can also be exported and imported alone.
5. Content and personal state are stored separately. Marks, results and progress point at content
   by id, so replacing content keeps them, and an exported file never carries them.
6. "Generate" uses ONE model per run. If the user has several models enabled in Settings, the
   create form shows a picker with the default preselected. No parallel runs, no comparing
   candidates.
7. Quizzes get two AI buttons: "Explain deeper" on any answered question, and "Check" on written
   answers (essays, and short answers that are not on the accepted list). Both use the chosen
   model.
8. Focus mode stays inside the app. Do not touch the phone's Do Not Disturb setting.
9. Plain SQL behind a small driver interface (`src/data/sql.ts`), not Drizzle. The SQLite package
   recommends its async API and Drizzle's Expo driver uses the blocking one.
10. Tabs appear only when their feature exists. Today there are two: Library and Settings.

Approved suggestions and where they belong:

| Suggestion | Status |
| --- | --- |
| Fix prompt for failed imports | Built in step 4 |
| Create from the user's own material | Built in step 4 |
| Quiz or flashcards from a lesson | Built in step 4 (prompt path). Add the Generate path in step 7 |
| Custom base URL for providers | Step 6 |
| Token usage shown after every AI action | Step 7 |
| Spaced review of missed questions and flashcards | Step 9 |

Assumptions the user was told about and has not objected to. Keep them unless told otherwise:

- A score given by the model through "Check" counts toward a test result, marked as AI-graded.
- Without an API key, essays fall back to showing the model answer for self-rating. Already built.
- Text, code, images and SVG pictures. No audio or video. SVG pictures are a lesson block (`svg`)
  that a chatbot writes as code. They are cleaned by `src/core/svg.ts` (no scripts, handlers or
  outside links) and drawn in an `<img>` on the web and in a web view with JavaScript and network
  off on phones, so CSS and SMIL animation plays. The create form's "Pictures" toggle asks for them.
- Create with AI can leave the level and the size (lessons, questions, cards) to the model ("Let AI
  choose"). The model then picks within the usual limits, guided by the topic and notes.
- Groups: an item is in one group or none (`groups` table, `items.group_id`). An exported item
  names its group; a whole group exports as a `group/1` file. Backups carry groups.
- Model catalog: `src/core/ai/catalog.json` holds ordered id patterns per provider (group,
  modalities, free tier or paid) and `catalog.ts` combines them with what the provider reports
  (Gemini's methods, OpenRouter's modalities and prices). Every listed model is kept; the provider
  screen groups them and only models that can write get a checkbox. Pickers ask for a task
  (`choices('write')`). Free and paid are a guide with a date; update the JSON when they change.
- Per-minute limits are waited out (with "Use another model now"); daily limits and used-up credit
  stop the run at once and suggest another model. Every HTTP request is logged; "N failed" opens
  the list (`state.failures`).
- Generation waits out rate limits and busy servers (Retry-After or Google's retryDelay, up to
  90 s, three times per request) and counts every request, failed ones too. A failed run can be
  retried with another model.
- English, Uzbek (Latin) and Russian (`src/i18n/en.ts`, `uz.ts`, `ru.ts`). The app follows the phone's language until one is chosen in Settings or on the welcome screen (setting `app.language`). Reminders are rescheduled in the new language.
- Typed answers ignore case, spacing and punctuation but keep accents.
- Completing a lesson is a manual button and does not require passing its test.

## What is built

All on branch `claude/quirky-cori-s17bdd`.

| Step | Commit | Contents |
| --- | --- | --- |
| 1 Foundation, 2 Format and library | `a8d5cdd` | Project, lint, tests, CI, theme, translations, SQLite with migrations, the schema with seven question types, library with search, filters, favorites, completed, trash with undo, samples |
| 3 Lesson player and quiz engine | `757ed26` | Lesson reader, Markdown subset, player for all seven types in practice, test and exam modes, grading, attempts saved and resumed, results with review, course resume, deck study |
| 4 Import, export, Prompt for AI | `3a88235` | Create form, prompt builder, tolerant import with automatic repairs, conflict handling, fix prompt, export, lesson files, backup and restore |
| 5 Editor and drag-and-drop types | `19d1e0a` | Editing of details, lessons, blocks, assessments and every question type, with reorder and undo on removal; matching, ordering and sort-into-groups with drag and a tap alternative |
| 6 Settings and providers | `1053fd1` | Provider list, keys in the secure store, test and detect models, model checkboxes, default model, adapters for Claude (official SDK), Gemini and OpenAI-compatible with a base URL; providers travel in backups without keys |
| 7 Generate, Check, Explain deeper | `45e27ce` | Generate on the create form with a model picker; course outline the user edits before lessons are written; lessons two at a time; every step saved and resumed on app start; one repair request per bad reply; review before adding; Check with AI for essays and short answers, its score counts and is marked; Explain deeper; tokens shown after every AI action |
| 8 Focus, Pomodoro, notifications | `65e6264` | Focus tab with a Pomodoro timer stored as an end time, sessions logged with interruptions, streak; focus view on lessons with the header hidden and the screen kept awake; reminders in Settings; one planner reconciles local notifications; a notice when generation finishes in the background |
| 9 Review, stats, release | see `git log` | Review queue fed by missed questions and studied flashcards, with gaps of about a day, three, a week and longer; Review tab with due counts, streak, last 7 days and quiz averages; first-run welcome; axe accessibility audit of every main screen with its problems fixed; EAS build profiles and release notes |

Question types today: `single_choice`, `multiple_choice`, `true_false`, `short_answer`, `cloze`,
`essay`, `flashcard`, `matching`, `ordering`, `categorize`.

Editing: pure document edits in `src/core/edit/document.ts`, question form state in
`src/core/edit/drafts.ts`, screens under `src/app/item/[id]/edit/`. Structural changes save at once
and a removal can be undone from the message that follows it.

Where things are:

- `src/core/schema` the file format. `src/core/quiz` answers, grading, attempt logic.
  `src/core/transfer` import, export, repairs, prompt and fix prompt. `src/core/markdown.ts`.
  `src/core/templates` blank documents and the three bundled samples.
- `src/data` migrations, repositories (library, attempts, settings, backup), the React provider
  and the `useQuery` hook that re-reads after any write.
- `src/platform/files.ts` the only place device file, share and clipboard APIs are called.
- `src/features/library` and `src/features/study` behaviour shared by screens.
- `src/app` the routes: `(tabs)/index` library, `(tabs)/settings`, `item/[id]`,
  `item/[id]/lesson/[lessonId]`, `item/[id]/play/[assessmentId]`, `item/[id]/result/[attemptId]`,
  `create`, `import`, `trash`.
- `src/ui` theme, controls, overlays, layout, Markdown renderer, icons.

## What remains

Work one step at a time, in this order.

### Step 5: Editor and drag-and-drop question types (built)

- Edit courses, lessons and blocks on the phone, with reordering, adding and removing.
- An editor for every question type, including the seven that exist.
- Three new types: matching pairs, ordering, sort into groups. Each needs a schema entry, an
  answer shape, grading (per pair, per position, per item), a view, a line in the prompt rules in
  `src/core/transfer/prompt.ts`, and any sensible repair in `src/core/transfer/repair.ts`.
- Give each drag interaction a tap alternative, so it works with a screen reader.
- Removing a lesson should go to a trash with undo, like items do.
- Done when a complete course using every question type can be built on the phone with no file.

### Step 6: Settings and providers (built)

- Provider list with add, edit and remove. Each entry: kind, label, key, and a base URL for the
  compatible kind.
- Keys go in the device's secure store (`expo-secure-store`, pinned by the SDK at `~58.0.3`).
  Never in SQLite, exports, backups or logs.
- "Test and detect" lists the provider's models, filters out ones that cannot write text, and
  shows checkboxes. One checked model is the default.
- Three adapters behind one interface (check the key, list models, generate against a schema,
  report token usage):
  - Claude: `GET /v1/models`, structured output through `output_config.format`, streamed. Handle
    the `refusal` and `max_tokens` stop reasons. Load the `claude-api` skill before writing this
    adapter and follow it instead of memory.
  - Gemini: models list filtered by supported generation methods, response schema in the
    generation config.
  - OpenAI-compatible with a configurable base URL: covers OpenAI, Grok, OpenRouter, DeepSeek,
    Mistral and local servers. JSON-schema response format where supported, plain JSON mode plus
    validation where not.
- Done when keys for three providers are saved, each lists its models, and no key appears in a
  backup file.

### Step 7: Generate, Check and Explain deeper (built)

- A "Generate" button on the existing create form, next to "Prompt for AI", with the model picker.
- One request for a lesson, quiz or deck. For a course: an outline first that the user can edit,
  then each lesson as its own request, a few at a time, validated and retried on its own.
- Jobs are saved step by step in the database, so a run interrupted by the phone suspending the
  app resumes from the last finished lesson. A notification says when it is done.
- Reuse the existing pipeline: `buildPrompt`, `repairImport`, `readImport`, then the same preview
  the import screen shows. One automatic repair request when validation fails.
- "Check" and "Explain deeper" in the player and results. Save Check results with the attempt.
- Show tokens used after every AI action.
- Done when a course, a quiz and a deck are each generated with a picked model, an interrupted
  course run finishes after reopening the app, and an essay comes back with a score and feedback.

### Step 8: Focus, Pomodoro and notifications (built)

- Focus view: lesson full screen, navigation hidden, screen kept awake, leaving the app during a
  session recorded as an interruption.
- Pomodoro as a state machine that stores the moment a phase ends, not a tick count, so it stays
  correct in the background. Adjustable lengths. Sessions logged against a course or lesson.
- Local notifications only: daily reminder skipped on days already studied, phase finished,
  reviews due, streak about to break, generation finished. One planner computes what should be
  scheduled and reconciles it with what is. iOS keeps at most 64 pending local notifications and
  Android 13 and later needs permission first.
- Add the Focus tab now.
- Done when a timer started before the app is closed still rings on time, and reminders stop on
  days already studied.

### Step 9: Review, stats and release (built)

- Review queue: missed questions join flashcards and return after growing gaps. Flashcard ratings
  are already recorded in attempts and only need scheduling. Add the Review tab.
- Streaks and study statistics, first-run walkthrough, accessibility pass, store builds with EAS.
- The app's display name is "Anki" and the icons are Expo's placeholders. "Anki" is the name of
  an existing flashcard app, so raise the name with the user before any store work.

## How to work

- One plan step per turn: build it, verify it, commit, push, then report. The user answers
  "continue" between steps.
- Commit on `claude/quirky-cori-s17bdd` and push after every step. Do not open a pull request
  unless asked.
- Keep the layering in `README.md`. `src/core` must not import React, React Native or Expo. A lint
  rule enforces this.
- Put real logic in `src/core` and test it there. Repository tests run against a real in-memory
  SQLite through `src/data/testing/memory-driver.ts`.
- Schema changes are new entries at the end of `migrations` in `src/data/migrations.ts`. Never
  edit one that has shipped. Add new tables to the backup in `src/data/backup.ts` too.
- Every user-facing string goes in `src/i18n/en.ts`, with the same key in `uz.ts` and `ru.ts` (Russian also needs `_few` and `_many` plural forms). `src/i18n/i18n.test.ts` fails if a key or placeholder is missing.
- After creating, importing or generating an item, open it with `openNewItem` (`src/features/library/open-item.ts`) so Back goes to the library.
- Run `npm run check` (lint, types, tests) before calling a step done.
- Report plainly: what works, how it was checked, what was not verified, and choices the user may
  want changed. The user reads on a phone, so keep reports short and concrete.

## AI providers as built

- `src/core/ai`: one adapter per kind behind `listModels` and `generate`, each taking an injectable
  `fetch`. Errors become `AiError` with a kind the screens explain. `strictSchema` strips JSON Schema
  features strict structured output rejects.
- Claude is called over plain HTTP (`x-api-key`, `anthropic-version: 2026-10-21`), like the other two
  providers. Do not bring back `@anthropic-ai/sdk`: it crashed the app on a phone at start-up with
  "Cannot read property 'BetaToolRunner' of undefined", a circular import inside the SDK that the web
  build and Jest do not reproduce. Requests are not streamed: React Native's fetch cannot read a
  streamed body.
- Keys: `src/platform/secrets.ts`. On the web build they sit in local storage, development only.
- `e2e/mock-ai.js` stands in for all three providers in browser checks. Set `state.reply` to control
  what generation returns.

## Generation as built

- `src/core/generate/plan.ts` is the whole pipeline as pure functions: `nextStep` says what to do,
  `runStep` does it with an injected `ask`, and the result is a new state. Tested in
  `src/core/generate/generate.test.ts` with a scripted model.
- `src/features/ai/job-runner.tsx` runs steps in the background, saves after each, and resumes runs
  marked `running` when the app starts. Jobs live in the `jobs` table.
- AI feedback is stored in the attempt's state (`ai` and `explanations`) and travels in backups.
- Not built yet: the notification when a run finishes. That belongs to step 8's notification planner.

## Focus and notifications as built

- `src/core/focus`: the timer (`pomodoro.ts`), study days and streaks (`days.ts`), and the
  notification planner with `reconcile` (`planner.ts`). All pure and tested.
- `src/features/focus/notifications-sync.tsx` re-plans on app start, on returning to the front and
  after any write. It takes `reviewsDueAt`, which step 9 must supply; today it is always null.
- The app records what it scheduled in the `notify.scheduled` setting, because the device does not
  report trigger times back reliably. On the web the schedule is kept in `globalThis.__notifications`.
- On the web, hidden tabs stay mounted, so text from the Focus tab can match in other screens.
  Narrow browser lookups with `.locator('visible=true')`.

## What remains

The plan is complete. Before a store release, the user has to decide, and has not yet:

1. The app's name. `app.json` says "Anki", which is an existing flashcard app. Ask before changing.
2. `ios.bundleIdentifier` and `android.package`. Do not invent them: they are permanent.
3. Icons and splash art. The files in `assets/` are Expo placeholders.
4. A privacy policy, because text goes to the AI providers the user adds.

Then, on real phones (nothing native has run yet): tab bar spacing, keyboard behaviour, drag and drop,
the file picker and share sheet, secure storage of keys, notification permission and delivery, keeping
the screen awake, and a real Generate run with each provider.

## Things that will trip you up

- `npx expo install` cannot reach Expo's servers from the cloud environment. Install with npm at
  the version in `node_modules/expo/bundledNativeModules.json`, which is what that command would
  have picked.
- `docs.expo.dev` is blocked there too. `AGENTS.md` says to read the versioned docs; when you
  cannot, read the installed package's type definitions and the notes some packages ship in
  `node_modules/<package>/skills/`. Do not write Expo API calls from memory. SDK 58 differs from
  older versions, for example the file system API is `File` and `Paths`, not the old functions.
- No phone or simulator is available in the cloud environment. The only runnable target is the
  web build, so nothing native has been run yet.
- SQLite on the web needs cross-origin isolation. `metro.config.js` sets the headers for the dev
  server. A static export must be served with `Cross-Origin-Embedder-Policy: credentialless` and
  `Cross-Origin-Opener-Policy: same-origin`.

## How the work was verified so far

Besides `npm run check`, each step was driven end to end in a headless browser:

1. `CI=1 npx expo export --platform web` writes `dist/`.
2. A small Node server serves `dist/` with the two headers above and falls back to `index.html`.
3. A Playwright script at phone size walks through the flows and asserts on what is shown, on
   downloads, on the clipboard and on data surviving a reload.

The scripts are in `e2e/`, on a shared harness in `e2e/harness.js`. Run them all with
`npm run e2e`. Add a new file there for each step you build. Two things to know when you do: screens underneath the current one stay
mounted on the web, so pick the button that is actually on top, and match accessible names
exactly because several labels share words.

## Not verified yet

- Anything on iOS or Android: tab bar spacing, keyboard behaviour, the file picker and the share
  sheet.
- Two technical checks from step 1 that need a real device: streamed HTTP responses and
  drag-and-drop performance.
- The exam time limit, image blocks, hints and random question sampling: written, and the logic
  is unit-tested where it can be, but no bundled sample exercises them in the player.
- A round trip through a real chatbot. Import was tested with a simulated reply.
- The GitHub Actions workflow in `.github/workflows/ci.yml` runs on pull requests and on pushes to
  `main`, so it has not run yet.
- Opening a course file from another app ("Open with") is not built.

## Start here

Confirm the repository state with `git log --oneline` and `npm run check`, then begin step 5.
