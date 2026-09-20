# Słówka

A small static web app for studying and testing common **English, Polish, and German** lemmas. You pick a prompt language and an answer language, type a translation, and get immediate correct / incorrect feedback. When the answer is shown, **each accepted form is listed with a short context** (gender, sense, or register).

One concept per card. Citation form for open-class words: nominative singular nouns, base adjectives, infinitive verbs. Closed-class gender families (articles, demonstratives, possessive and relative pronouns) are **one card** that accepts the nominative forms a learner would reasonably type.

## What you can do

- **Quiz mode** (default): type every answer; skip counts as incorrect; score and missed-word review at the end.
- **Study mode**: type to check, or reveal the answer without scoring.
- **Any language pair** among English, Polish, and German. Defaults to English → Polish so existing users keep the original flow. Examples: EN→PL, PL→EN, EN→DE, DE→EN, PL→DE, DE→PL.
- Frequency bands (first 100 / 250 / 500 / all 1000, plus later slices) and round sizes of 10, 20, 50, or the whole band. Bands follow the **answer language’s frequency list** when that language is Polish or German.
- **Any listed answer is correct** (case-insensitive, trimmed whitespace). Diacritics are required. A leading English *to* / *a* / *an* / *the* is optional. An on-screen **ą ć ę ł ń ó ś ź ż** bar appears when the answer language is Polish; **ä ö ü ß** appears when it is German.

No backend. The deck is bundled JSON.

## Run locally

Needs Node.js 20+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/language-tool/`). The `base` is `/language-tool/` so the same asset paths work on GitHub Pages.

```bash
npm test          # unit tests for answer matching, families, and reveal UI
npm run build     # production build to dist/
npm run preview   # serve the production build
```

The app is a Vite + React static site. GitHub Actions builds `dist/` and publishes it to GitHub Pages.

**Live site:** https://joe-lazzarini.github.io/language-tool/

## Data

`public/data/words.json` — a multilingual deck. Each entry is a concept with translations for the languages it covers (`en`, `pl`, `de`) and optional per-language frequency ranks. Each language form has:

- `text` — prompt / citation display (slash-joined for gender families)
- `accepted` — `{ text, context? }[]` — every typed answer that counts as correct, with an optional short gloss shown on reveal

Approximate usable cards per direction (see `meta.coverage` in the JSON after a rebuild):

| Pair | Source of the ~1000 cards |
| --- | --- |
| English ↔ Polish | 1000 KWJP Polish lemmas with English glosses |
| English ↔ German | 1000 UD German-GSD lemmas with English glosses |
| Polish ↔ German | the 1000 Polish lemmas mapped to a German citation form |

Ranks are language-specific. The “first 100” of EN→DE is the 100 most frequent German lemmas, not the German translations of the first 100 Polish lemmas.

**Gaps.** There is no perfect 1:1 across all three languages at every frequency rank. German articles (`der`, `ein`) have no Polish equivalent and stay on the English↔German side only. Some high-frequency Polish function words share a German citation form (for example *móc*, *można*, *potrafić* → *können*); those remain separate Polish→German cards. A few Polish↔German mappings are sense-approximations for learner use.

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
npm run data    # optional; refresh scripts/pl-en.json from KWJP + Wiktionary (needs network)
npm run deck    # merge Polish + German sources into public/data/words.json
```

## Project layout

```
public/data/words.json        bundled multilingual deck
scripts/families.py           merge rules, gender paradigms, backfill
scripts/pl-en.json            Polish lemmas + English glosses
scripts/de-lemmas.txt         UD-GSD rank → German lemma
scripts/de-glosses.tsv        German lemma → English gloss
scripts/pl-de.tsv             Polish lemma → German citation form
scripts/build-dataset.py      rebuild Polish glosses
scripts/build-deck.py         merge the multilingual deck
src/App.tsx                   study + quiz UI
src/components/AnswerReveal.tsx  accepted answers + context on reveal
src/lib/deck.ts               pair filtering and session cards
src/lib/match.ts              answer checking
```
