# Sentence quiz and word accuracy

Plan for two related additions to Słówka:

1. Remember how the user does on each word, derive which words they know, and let study and quiz focus on weak words.
2. A separate sentence quiz that **composes** grammatical sentences from those known words (phrase-structure / feature-based rules, not three fixed frames) and asks for a translation in the other selected language.

Sentence quiz stays in its own folder, screen, and home card. The existing quiz gains one grading callback and a focus control. Card selection for weak words lives next to the accuracy data, not inside the old session component.

No paid translation or generation API. Morphology rules, closed-class function words, and inflection tables ship in the client. Study-word surfaces still load from `grammar.json` when needed.

## How accuracy is stored

Accuracy is the only record of practice. “Known” is computed from it. There is no second known-word collection and no separate streak key.

Each record is for one **ordered direction**: prompt language, then answer language. English prompt with a Polish answer is `en_pl`. The reverse direction is a different document. That matches how study and quiz already work: the user is practicing production in the answer language. Weak-word focus uses the direction of the round that is about to start.

A word id is the deck entry id (`pl-103`) or a custom word id. The same id is used whichever side of the card is showing.

### Document

Firestore path: `users/{uid}/accuracy/{from}_{to}`

One document per user per direction the user has actually practiced. Documents for other directions are not created and not read. The client loads the accuracy subcollection once at sign-in (a single query), then writes only directions that changed.

```ts
type StatTuple = [
  correct: number,    // lifetime correct checks
  attempts: number,   // lifetime graded attempts
  lastSeenMs: number, // last graded attempt or manual toggle
  windowBits: number, // last 8 results, newest in the low bit, 1 = correct
  windowLen: number,  // how many of those bits are real (0–8)
  manual: number,     // 1 = user marked this word known on this direction
];

type AccuracyDoc = {
  words: Record<string, StatTuple>; // keyed by word id
  updatedAt: string;                 // ISO timestamp of the last local edit
};
```

In memory each loaded direction is a `Map<string, WordStat>` so membership and lookup are O(1). The tuple is only the on-disk and Firestore shape.

Caps, per direction document:

- at most 1500 word ids
- Firestore rule rejects the write when `request.resource.size()` is 200 KB or more

When a new id would exceed 1500, the client drops the least recently seen id, preferring to drop one that is not manually marked.

### What counts as an attempt

Recorded from the existing session through one callback, `onGraded(wordId, correct)`:

| Action | Quiz | Study |
| --- | --- | --- |
| Check, right or wrong | recorded | recorded |
| Skip | recorded as wrong | — |
| Reveal without typing | — | not recorded |

Sentence-quiz answers are not word attempts and do not change these counts.

Each recorded attempt updates the in-memory map and `localStorage` immediately, and schedules one Firestore write for that direction. Skips and checks in the same second collapse into a single `setDoc`. Turning the page hidden flushes the pending directions. A graded answer never waits on the network.

### Local copy and sign-in

`localStorage` key `slowka-accuracy-v1` holds the same documents, keyed by direction. With no Firebase user the browser copy is the only copy.

On sign-in the client reads `users/{uid}/accuracy` once and merges each direction:

- `correct` and `attempts` take the max of the two copies, then `attempts` is raised to at least `correct`
- the recent window, the manual bit, and `lastSeenMs` come from the copy with the later `lastSeenMs`

Two devices that both add an attempt from the same base can under-count by keeping the max. That is the tradeoff for a compact document with no per-attempt log. The merged document is written back only when it differs from the remote copy.

Signing out keeps the browser copy, same as custom words. The next account that signs in on this browser is merged with that copy.

### Manual known

The sentence screen can mark or unmark a lexicon word for one side of the current pair. Marking Polish while the pair is English–Polish sets `manual` to 1 on `en_pl` (the direction whose answer language is Polish) and refreshes `lastSeenMs`. It does not invent correct answers. Unmarking clears the bit. A row with no attempts and no manual bit is deleted.

## How “known” is derived

`isKnown(stat)` is true when either:

- `manual` is set, or
- the recent window holds at least 2 results and the two newest are both correct (`windowLen >= 2` and `(windowBits & 3) === 3`)

One correct answer is not enough. A later miss clears the two-in-a-row condition, so a word stops being known until it is solid again. The manual bit stays until the user clears it, including if later attempts are wrong. Lifetime counts stay either way. They feed weak-word focus, not the known bit.

For the selected pair, “known in Polish” means known on the direction that **answers** in Polish (`en_pl` when the other language is English). “known in English” uses the opposite direction. Sentence quiz loads those two directions and no others. A word the user knows only on a different pair is not treated as known here, because that document is not the one this pair practices.

A sentence-lexicon item counts as known on a side when the lexicon id itself, or any deck id listed for that item, is known on that direction. Quiz progress on `pl-103` therefore unlocks the lexicon word `house` without a second id space.

## Weak words in study and quiz

Home gains a **Focus** control: **All** or **Weak words**. It is stored on the existing settings object (`focus: "all" | "weak"`, default `all`) and applies to both study and quiz. It does not apply to sentence quiz.

A word in the current band is **weak** when it has at least one attempt and either the lifetime accuracy or the recent-window accuracy is below 0.6. Accuracy is `correct / attempts`, or the fraction of 1-bits in the window. A word with no history is not weak.

Selection (`selectCards`), using the in-memory map for the round’s direction:

- **All** shuffles the band and takes the round size. Same result shape as today.
- **Weak**, with a numeric round size: take the weak cards first. If there are fewer than the round size, fill with cards that have no attempts, then with the remaining cards. The round still reaches the size the user picked whenever the band is large enough.
- **Weak** and round size **All**: use only the weak cards. If none are weak, use the whole band.
- **Weak** and the band has no weak cards yet (little or no history): use the whole band, and the hint on the home screen says there is not enough history yet.

The home hint shows how many cards in the current band are weak for this direction, so the fallback is visible before the round starts.

`buildSession` stays as it is. `start` calls `selectCards` instead, which uses `buildSession` for the All path.

## Sentence quiz

### Unlock

Sentence quiz unlocks for the current pair when the generator can build at least **4** distinct sentences from **eligible study words**. Eligible means: the card is in the current pair's study vocabulary (deck + add-a-word), it is **known** on both sides, it is **not weak** (<60% accuracy) on those sides, and it has enough part-of-speech / grammar metadata to fill a typed slot. Articles, the copula, Japanese particles, Mandarin 很, conjunctions, prepositions, pronouns, and auxiliaries are **closed-class** template grammar, not content words.

The home card shows how many eligible study words are ready on each side and whether 4 sentences can be built. When locked, it explains how many more known words / sentences are needed. Opening before unlock shows study nouns/verbs/adjectives with per-side known toggles. After unlock, a round asks for up to 8 sentences.

### Generation (compositional)

Content words come from the user's **actual study vocabulary** for the pair — not a fixed preset list. Slot-fill metadata lives in `public/data/sentences/grammar.json` (keyed by deck / custom word id, with concept fallback), plus runtime inference from card POS, citation forms, and gender contexts. Per-language `public/data/sentences/<code>.json` files keep simple-clause frame strings for documentation / load compatibility; rendering is driven by the compositional engine.

The generator (`src/sentence/compose.ts`) randomly composes sentences from building blocks so **structure varies**:

| Structure family | Examples |
| --- | --- |
| Simple clauses | subject + VI / VT / copula+adj (legacy shapes, still enumerated exhaustively for unlock) |
| Attributive NP | “the big dog sees a small cat” with adjective–noun agreement |
| Adjuncts | adverbs; prepositional phrases of place (case-governed where required) |
| Polarity / mood | negation; yes/no questions (do-support, German V2 inversion, Polish *czy*, Mandarin 吗) |
| Tense | present / past / future (PL past gender agreement; DE perfect/future when forms are reliable) |
| Coordination | and / but / or between clauses |
| Subordination | because / when / if (German verb-final in the subordinate clause) |
| Relatives | who/that/which — solid for EN/PL/DE |

Difficulty and length scale with eligible known-word count and mean accuracy (short simple clauses early; more clauses and richer structures as the user progresses). The sampler avoids repeating the same **structure tag** on consecutive questions when alternatives exist.

Morphology must be correct in both the prompt and the expected answer(s): declension (case/number/gender for PL/RU/DE, including preposition-governed cases and animacy; German articles + attributive adjective endings), conjugation (person/number/tense; irregular tables where needed), agreement (subject–verb, adjective–noun, PL/RU past gender), and word order (German V2 / verb-final subordinates, question inversion, zh/ja particles). When a word lacks reliable inflection data for a required slot, that word is **excluded** from the slot rather than guessed.

In-memory indexes group eligible words by POS (`noun` / `verb` / `adjective`) for O(1) slot lookup. Function words come from `src/sentence/closedClass.ts`.

Language coverage: all supported codes (`en`, `pl`, `de`, `es`, `fr`, `it`, `pt`, `nl`, `ru`, `ja`, `zh`), with quality prioritized for **PL / DE / EN**.

### Checking a translation

The prompt is the canonical sentence in the prompt language. The answer language contributes one or more full sentences (canonical reference first, plus Japanese plain-form variants and listed alts). Reveal always shows the reference answer(s). On an incorrect answer, the UI **highlights which reference word(s) differ** from the typed attempt (wrong ending / wrong form) where token alignment is feasible.

A typed answer is graded for **grammar**: wrong case, conjugation, or agreement fails. Legitimate variants still pass:

- article flexibility from article-less prompt languages (PR #14 behavior): when the prompt has no articles and the answer language does, definite vs indefinite (and bare noun) are equivalent for compare only
- free word order where the target language allows it (Polish, Russian) — same multiset of correctly inflected tokens
- synonyms / alternate valid translations listed on the sentence
- contractions (English)
- case / punctuation / whitespace insensitivity; Japanese/Mandarin space folding; Russian `е`/`ё`

Folding otherwise:

- Unicode NFC, trimmed, internal whitespace collapsed, case folded with the answer language's locale
- the answer language's diacritic rules; curly apostrophes → straight; trailing `.!?。？！` removed
- Japanese and Mandarin: spaces removed for compare; Mandarin also accepts pinyin via the shared answer normalizer

Sentence rounds do not change word accuracy.

### Entry

Hash route `#sentence`. The home card is separate from My words and Study / Quiz.

## Firestore rules

`users/{uid}/words/...` is unchanged.

`users/{uid}/accuracy/{dirId}`:

- read, create, update, delete only when `request.auth.uid == userId`
- `dirId` matches `^[a-z]{2}_[a-z]{2}$`
- the document has only `words` and `updatedAt`
- `words` is a map of at most 1500 entries
- `updatedAt` is a string shorter than 40 characters
- the stored document is under 200 KB

Every other path stays denied. Rules cannot loop over map values, so the size cap and the byte cap are what bound a bad write. The client still writes only well-formed tuples.

## Tests

Accuracy:

- an attempt increments counts, shifts the window, and sets `lastSeenMs`
- one correct answer is not known; two newest corrects are known; a following miss is not known
- manual mark is known with zero attempts; unmark removes that
- weak predicate: a miss is weak, four corrects out of four are not, no history is not
- `selectCards` All matches a shuffle-and-cut; Weak prefers weak ids and fills with unseen; Weak with no history returns the whole pool; Weak with size All returns only weak ids
- merge keeps the higher counts and the newer window
- the 1500 cap evicts the oldest unmarked id
- the debounced writer flushes each dirty direction once
- `firestore.rules` mentions `accuracy`, the 1500 cap, and the byte cap

Sentences:

- no preset `index.json`; language files remain frames-compatible; generation is compositional
- generation uses only known, non-weak study words with enough grammar metadata
- a newly known custom word appears in generated sentences
- rounds vary structure and avoid immediate structure/id repeats when possible
- unlock at 4 distinct sentences; locked state explains missing words
- golden EN/PL/DE/ZH renderings from study ids (including Mandarin 很 / no inflection)
- multi-seed smoke tests: no ungrammatical PL/DE/EN outputs for known bad patterns; structural variety; difficulty scaling
- grading rejects wrong case / conjugation / agreement; accepts free word order (PL/RU), contractions, and article flexibility; reveal highlights mismatched tokens
- article equivalence: PL→EN and PL→DE accept a/the/der/die/…/bare; EN→PL unaffected; EN→DE stays strict; ZH→EN flexible
- answer check still accepts case, spacing, missing final period, Japanese plain form, Russian `е`/`ё`

Existing unit tests stay as they are. CI requires `tsc -b`, the full Vitest suite, and `npm run build`.

## UI files

- `src/accuracy/` — stats, local document, debounced remote write, hook
- `src/sentence/` — loaders, vocab index, closed-class lexicon, morphology, compositional composer, checker + diff highlight, home card, sentence screen
- `src/App.tsx` — focus control, `selectCards` at start, `onGraded` on the session, sentence card and `#sentence` screen
- `src/types.ts` — `focus` on settings
- `firestore.rules` — accuracy path
- `README.md` — accuracy, focus, and sentence quiz
