# Słówka

A small static web app for studying and testing common lemmas across the languages in the registry (English, Polish, German, Spanish, French, Italian, Portuguese, Dutch, Russian, and Japanese). You pick any two — a prompt language and an answer language — type a translation, and get immediate correct / incorrect feedback. When the answer is shown, **each accepted form is listed with a short context** (gender, sense, register, or romanization).

One concept per card. Citation form for open-class words: nominative singular nouns, base adjectives, infinitive verbs. Closed-class gender families (articles, demonstratives, possessive and relative pronouns) are **one card** that accepts the nominative forms a learner would reasonably type.

## What you can do

- **Quiz mode** (default): type every answer; skip counts as incorrect; score and missed-word review at the end.
- **Study mode**: type to check, or reveal the answer without scoring.
- **Any two different languages.** Prompt and answer each have a menu, plus a swap button. The pair is saved in this browser. A new visit starts at English → Polish.
- Frequency bands (first 100 / 250 / 500 / all, plus later slices) and round sizes of 10, 20, 50, or the whole band. When the pair includes Polish or German, that side’s frequency list decides which cards and which order. Other pairs share one concept list, ordered by the best Polish or German rank those cards have.
- **Any listed answer is correct** (case-insensitive, trimmed whitespace). Whether diacritics are required is set per language in the registry. A leading English *to* / *a* / *an* / *the* is optional on English answers. An on-screen letter bar appears for languages that list special letters (Polish, German, Spanish, French, Italian, Portuguese, Dutch).
- **Add a word** you came across. Type it in one supported language. The app fills in the others, you confirm or edit them, then save. A card needs at least two languages, so words saved before this change still load.
- **Your words** join study and quiz: they are part of the full deck, and you can also select the **My words** band. They work in every language-pair direction. Edit or delete them from the list.
- **Sync** is optional. Without Firebase config, words stay in this browser (`localStorage`). With Firebase, Google sign-in stores them in Firestore and the first sign-in merges words already saved on the device.

Each language’s deck is a separate JSON file and is loaded when you need it. Custom words are the only data stored per user.

## Run locally

Needs Node.js 20+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/language-tool/`). The `base` is `/language-tool/` so the same asset paths work on GitHub Pages.

```bash
npm test          # unit tests for answer matching, families, reveal UI, lookup, and sync
npm run build     # production build to dist/
npm run preview   # serve the production build
```

Copy `.env.example` to `.env` and fill in the Firebase web config if you want cloud sync locally. Leave the values empty to stay on this browser only. Restart `npm run dev` after changing `.env`.

The app is a Vite + React static site. GitHub Actions builds `dist/` and publishes it to GitHub Pages. The build job reads `VITE_FIREBASE_*` from the `github-pages` environment (variables, then secrets of the same name). If they are unset, the deployed site still builds and keeps words on the device.

**Live site:** https://joe-lazzarini.github.io/language-tool/

## Add a word

1. Choose the language you saw the word in and type it.
2. The app looks up the other languages in this order:
   - the bundled deck (same accepted answers and short contexts as study mode)
   - [English Wiktionary](https://en.wiktionary.org/) (dictionary / citation forms, including gender and a short qualifier when the entry has them). Inflected forms such as *koty* or *cats* follow the lemma.
   - [MyMemory](https://mymemory.translated.net/) if Wiktionary has no hit. Those lines are a translation memory, so check the citation form before saving.
3. Edit the card text, the accepted answers, and the optional context, then save.

A saved card needs at least two languages. Empty languages are left off the card, so an older word that only has English, Polish, and German still saves and still works for those pairs. Frequency bands stay the built-in lists. **All** includes your words. **My words** is only your words.

Firestore allows up to 32 language forms on one card (`firestore.rules`). Cards saved with the new languages need that rules file published. A card that still has only two or three forms matches the previous rule as well.

## Cloud sync (Firebase Spark)

The project does not ship with a Firebase project. Create one, then set six variables on the `github-pages` environment and redeploy. The web config is public in the built JavaScript; `firestore.rules` is what keeps each person’s words private.

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project. Google Analytics is optional.
2. Project settings (gear) → **General** → **Your apps** → **Add app** → **Web** (`</>`). Register the app (nickname `slowka` is fine). You do not need Firebase Hosting. Copy the `firebaseConfig` values.
3. **Build → Authentication → Get started → Sign-in method → Google → Enable**. Pick a support email and save.
4. **Authentication → Settings → Authorized domains → Add domain** and add `joe-lazzarini.github.io`. `localhost` is already on the list, so local `npm run dev` can sign in too. The authorized domain is the host only, not the `/language-tool/` path.
5. **Build → Firestore Database → Create database**. Start in **production mode**. Pick a region close to you (for example `europe-west1`).
6. Give GitHub a key so the Pages workflow can publish `firestore.rules` with the site. Production mode denies every read and write until those rules are deployed.

   - Firebase console → Project settings (gear) → **Service accounts** → **Generate new private key**. Confirm the download. That JSON is the Firebase Admin SDK key. Do not commit it.
   - GitHub → **Settings → Environments → github-pages → Environment secrets → Add secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the whole JSON file.

7. On the same **github-pages** environment, under **Environment variables**, add these. Use the values from the web app config in step 2. The same names work as environment secrets if you prefer; the workflow checks variables first. Do not create a separate environment.

   | Name | Firebase field |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` (usually `YOUR_PROJECT_ID.firebaseapp.com`) |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |

8. **Actions → Deploy GitHub Pages → Run workflow** (or push a commit). The workflow uploads the site first, then publishes `firestore.rules` with the service account. A rules failure does not stop the Pages deploy. The Firebase Admin SDK key from step 6 can release rules. It cannot pass the Firebase CLI's Service Usage preflight, so the workflow calls the Rules API directly. If that call is denied, open [IAM](https://console.cloud.google.com/iam-admin/iam) for the project, edit the service account named in the log (`client_email` in the JSON), add the role **Firebase Rules Admin**, and re-run the workflow. Sign in with Google on the live site and add a word; it should appear on another browser after you sign in there.

For local development, put the same six values in `.env` (see `.env.example`). An incomplete config is ignored: the app shows that cloud sync is not configured and keeps using this browser.

## Data

`public/data/catalog.json` lists concepts (`id`, part of speech, frequency `ranks`, and a `concept` key). `public/data/langs/<code>.json` maps each concept id to that language’s form. The app fetches the catalog once, then the two language files for the pair you picked, and the rest in the background. Add-a-word waits until every language file is loaded so a deck hit can fill them all.

Each form has:

- `text` — prompt / citation display (slash-joined for gender families). Romanization is not part of the prompt.
- `accepted` — `{ text, context? }[]` — every typed answer that counts as correct, with an optional short gloss shown on reveal. `context: "romanization"` marks a Latin spelling of a Russian or Japanese form.

Approximate usable cards (see `meta.coverage` after a rebuild):

| Pair | Source of the cards |
| --- | --- |
| English ↔ Polish | 1000 KWJP Polish lemmas with English glosses |
| English ↔ German | 1000 UD German-GSD lemmas with English glosses |
| Polish ↔ German | the 1000 Polish lemmas mapped to a German citation form |
| Any other pair | concepts that have both translations, deduped by the English citation head |

Ranks are language-specific. The “first 100” of EN→DE is the 100 most frequent German lemmas, not the German translations of the first 100 Polish lemmas. Spanish → French has no frequency list of its own, so it follows the best Polish or German rank and collapses entries that share an English head. Distinct Polish words that only overlap in English stay separate on the Polish and German lists.

**Gaps.** There is no perfect 1:1 across languages at every frequency rank. German articles (`der`, `ein`) have no Polish equivalent and stay on the English↔German side only. Russian and Japanese have no articles, so those cards are absent there. Some high-frequency Polish function words share a German citation form (for example *móc*, *można*, *potrafić* → *können*); those remain separate Polish→German cards. A few Polish↔German mappings are sense-approximations for learner use.

**Added languages.** Spanish, French, Italian, Portuguese, Dutch, Russian, and Japanese sit on the same concepts. Closed-class families (articles, demonstratives, pronouns, a handful of core verbs and prepositions) are written by hand in `scripts/extra_langs.py`. Other rows are the first sense in the English Wiktionary translation list. That can be the wrong part of speech, a near-synonym, or missing. Portuguese follows the Wiktionary line “Portuguese” (often European) and also accepts a form when that line, the “Brazilian Portuguese” alias, or a hand entry lists it.

**Russian and Japanese answers.** Type the native script or the Latin form stored on the card.

- Russian: Cyrillic, or a letter-by-letter transliteration (`что` → `chto`, `ё` → `e`, `щ` → `shch`). Stress marks are ignored. `ё` and `е` both count. The reveal list shows the transliteration. It is a learner convenience, not a scholarly system — `что` is `chto`, and the complementizer also accepts `shto`.
- Japanese: kanji or kana, or Hepburn romaji. Macrons are optional (`kyō` and `kyo` match). When the stored romaji has a macron, the `ou` / `uu` spelling is accepted too (`tōkyō` and `toukyou`). Dakuten stay significant (`が` is not `か`). There is no on-screen kana keyboard; use the device IME. Cards whose Wiktionary line had no `tr=` parameter accept the native script only — the reveal list is the full set of accepted answers.

### Mapping rules

Rules live in `scripts/families.py` and are applied by `npm run deck` (`scripts/build-deck.py`).

**One concept per card.** Merge when the frequency lists would otherwise show the same idea twice:

1. **Gender / citation paradigms** listed as separate lemmas — Polish demonstratives *ten* and *to* become one card that also accepts **ta**. Typed answers: *ten*, *ta*, *to*. German articles and gendered determiners that were already one UD lemma (*der*, *ein*, *dieser*, …) stay one card and accept nominative gender-mates (*der* / *die* / *das*, *ein* / *eine*, …).
2. **Short/long or spelling doublets** of the same word — *tu* / *tutaj*, *dziś* / *dzisiaj*, *znów* / *znowu*, *choć* / *chociaż*, *jeśli* / *jeżeli*.
3. **Function-word synonyms with the same English prompt** — *lub* / *albo* (“or”), *też* / *także* (“also”), *że* / *iż* (“that”), plus the same-concept pair *samochód* / *auto*.

**Do not merge:** aspectual pairs (*robić* / *zrobić*), or distinct lexemes that only overlap in English (*wiedzieć* / *znać*, *ale* / *lecz*). Personal pronouns with different English glosses (*on* “he” vs *ona* “she”) stay separate.

**Accepted answers.** Every card accepts all of its `accepted` forms, not only the citation head. Closed-class Polish items that occupy a single KWJP slot still accept nominative gender-mates a learner would type (*który* / *która* / *które*, *mój* / *moja* / *moje*, *w* / *we*, *się* / *siebie*, …). After check, skip, or study reveal, each of those forms is listed with its context.

Merged-away slots are backfilled from the next KWJP / UD-GSD lemmas so each pair stays at 1000 cards.

### Frequency sources

**Polish ranking** comes from [Wiktionary: Frequency lists/Polish/KWJP](https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP), a lemma list based on the *Korpus Współczesnego Języka Polskiego* (KWJP), publications from 2011–2020. Entries that appear as more than one part of speech are merged and re-ranked by **average reduced frequency**.

Citation: W. Kieraś, M. Marciniak, M. Łaziński, M. Woliński, K. Bojałkowska, W. Eźlakowski, Ł. Kobyliński, D. Komosińska, K. Krasnowska-Kieraś, M. Rudolf, A. Tomaszewska, J. Wołoszyn, N. Zawadzka-Paluektau, “Korpus Współczesnego Języka Polskiego. Dekada 2011–2020,” *Język Polski* 105(2):5–20, 2025. https://jezyk-polski.pl/index.php/jp/article/view/1062

The ranked lemma list used by the rebuild script is saved at `scripts/kwjp-lemmas.txt`.

**German ranking** is computed from [Universal Dependencies German-GSD](https://universaldependencies.org/treebanks/de_gsd/index.html) (CC BY-SA 4.0): lemma frequencies over the treebank, then filtered to dictionary/citation forms (inflections collapsed; most proper names, abbreviations, and foreign tokens dropped). The ranked list is saved at `scripts/de-lemmas.txt`.

Citation: R. McDonald et al., “Universal Dependency Annotation for Multilingual Parsing,” ACL 2013; UD German-GSD release.

**English glosses** follow [English Wiktionary](https://en.wiktionary.org/) (CC BY-SA 4.0 / GFDL), with learner-facing overrides for high-frequency function words. Polish↔German citation forms are in `scripts/pl-de.tsv`.

To rebuild:

```bash
npm run data          # optional; refresh scripts/pl-en.json from KWJP + Wiktionary (needs network)
npm run translations  # optional; refresh scripts/cache/wiki-forms.json (needs network, resumable)
npm run deck          # merge every registry language into public/data/catalog.json and public/data/langs/
```

`npm run deck` applies hand overrides even when the Wiktionary cache is missing. Open-class translations for the extra languages come from the cache.

## Add a language

No UI or matcher edit. The registry is the list.

1. Add an object to `LANGUAGES` in `src/lib/languages.ts`. Keep the first fields in this order, because `scripts/registry.py` reads them: `code`, `name`, `nativeName`, `wiktionary`, `wiktionaryAliases`. Then set `flag`, `locale`, `specialLetters`, `optionalPrefixes`, `diacritics` (`required`, `strip-latin`, or `strip`), `foldChars` (only for substitutions that are not combining marks), `capitalizeLookup`, `pivot` (leave this `false` unless this language replaces English as the Wiktionary gloss language — only one language should be the pivot), and `answerHint`.
2. Add deck data:
   - Hand-check closed-class cards in `scripts/extra_langs.py` (`BY_PL`, `BY_DE`, or `BY_CONCEPT`). A language key set to `[]` means “no translation” and blocks Wiktionary for that card. A missing key falls through to Wiktionary, so a new language does not require editing every existing pack.
   - Run `npm run translations` so the cache includes the new Wiktionary name, then `npm run deck`.
3. `npm run deck` writes `public/data/langs/<code>.json`. The pickers, letter bar, add-a-word fields, and answer checker follow the registry.
4. Firestore already allows up to 32 forms on a saved card. Past that, raise `forms.size()` in `firestore.rules`.

English, Polish, and German citation forms still come from the frequency-list build (`scripts/build-deck.py` and `scripts/families.py`), not from the Wiktionary cache. Do not add those three codes to the cache step expecting it to replace them.

## Project layout

```
public/data/catalog.json      concept ids, ranks, part of speech
public/data/langs/<code>.json forms for one language, loaded on demand
firestore.rules               per-user Firestore rules (up to 32 forms)
firebase.json                 points the Firebase CLI at those rules
.env.example                  Vite names for the Firebase web config
scripts/families.py           merge rules, gender paradigms, backfill
scripts/registry.py           reads LANGUAGES from src/lib/languages.ts
scripts/extra_langs.py        hand families + Wiktionary cache attach
scripts/fetch-translations.py refreshes scripts/cache/wiki-forms.json
scripts/pl-en.json            Polish lemmas + English glosses
scripts/de-lemmas.txt         UD-GSD rank → German lemma
scripts/de-glosses.tsv        German lemma → English gloss
scripts/pl-de.tsv             Polish lemma → German citation form
scripts/build-dataset.py      rebuild Polish glosses
scripts/build-deck.py         merge the multilingual deck
src/lib/languages.ts          language registry (the list to edit)
src/App.tsx                   study + quiz UI
src/components/AddWord.tsx    look up, confirm, and save a card
src/components/WordList.tsx   edit or delete saved words
src/components/AnswerReveal.tsx  accepted answers + context on reveal
src/lib/deck.ts               pair filtering and session cards
src/lib/loadDeck.ts           lazy-load catalog + one file per language
src/lib/translate.ts          deck, then Wiktionary, then MyMemory
src/lib/customWords.ts        local store and account merge
src/lib/match.ts              answer checking
```
