# Słówka

A small static web app for studying and testing the **1000 most common Polish lemmas**. You see a prompt, type a translation, and get immediate correct / incorrect feedback with the expected dictionary form.

One lemma per word — nominative singular nouns, masculine nominative adjectives, infinitive verbs. No extra declensions, conjugations, or alternate forms.

## What you can do

- **Quiz mode** (default): type every answer; skip counts as incorrect; score and missed-word review at the end.
- **Study mode**: type to check, or reveal the answer without scoring.
- **Directions**: English → Polish (default, type the Polish lemma) or Polish → English (type a meaning).
- Frequency bands (first 100 / 250 / 500 / all 1000, plus later slices) and round sizes of 10, 20, 50, or the whole band.
- Case-insensitive matching with trimmed whitespace. Polish diacritics are required. An on-screen ą ć ę ł ń ó ś ź ż bar helps when you do not have a Polish keyboard.

No backend. The deck is bundled JSON.

## Run locally

Needs Node.js 20+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/language-tool/`). The `base` is `/language-tool/` so the same asset paths work on GitHub Pages.

```bash
npm test          # unit tests for answer matching
npm run build     # production build to dist/
npm run preview   # serve the production build
```

The app is a Vite + React static site. GitHub Actions builds `dist/` and publishes it to GitHub Pages.

**Live site:** https://joe-lazzarini.github.io/language-tool/

## Data

`public/data/words.json` — 1000 Polish lemmas with English glosses.

**Frequency ranking** comes from [Wiktionary: Frequency lists/Polish/KWJP](https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP), a lemma list based on the *Korpus Współczesnego Języka Polskiego* (KWJP), publications from 2011–2020. Entries that appear as more than one part of speech are merged and re-ranked by **average reduced frequency**.

Citation: W. Kieraś, M. Marciniak, M. Łaziński, M. Woliński, K. Bojałkowska, W. Eźlakowski, Ł. Kobyliński, D. Komosińska, K. Krasnowska-Kieraś, M. Rudolf, A. Tomaszewska, J. Wołoszyn, N. Zawadzka-Paluektau, “Korpus Współczesnego Języka Polskiego. Dekada 2011–2020,” *Język Polski* 105(2):5–20, 2025. https://jezyk-polski.pl/index.php/jp/article/view/1062

The ranked lemma list used by the rebuild script is saved at `scripts/kwjp-lemmas.txt`.

**English glosses** are taken from the [English Wiktionary](https://en.wiktionary.org/) (CC BY-SA 4.0 / GFDL), with a small set of learner-facing overrides for high-frequency function words. Inflected forms that appeared in the frequency list (for example *siebie*, *warunki*, *wybory*) were dropped so the deck stays one citation form per entry.

To rebuild glosses from Wiktionary (optional; needs network):

```bash
npm run data
```

## Project layout

```
public/data/words.json   bundled deck
scripts/build-dataset.py rebuild glosses
scripts/kwjp-lemmas.txt  KWJP rank → lemma
src/App.tsx              study + quiz UI
src/lib/match.ts         answer checking
```
