# Sentence quiz and word accuracy

Plan for two related additions to Słówka:

1. Remember how the user does on each word, derive which words they know, and let study and quiz focus on weak words.
2. A separate sentence quiz that builds short, grammatical sentences from those known words and asks for a translation in the other selected language.

Sentence quiz stays in its own folder, screen, and home card. The existing quiz gains one grading callback and a focus control. Card selection for weak words lives next to the accuracy data, not inside the old session component.

No paid translation or generation API. Templates and inflected forms ship as static JSON and load in the browser when needed.

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

For the selected pair, “known in Polish” means known on the direction that **answers** in Polish (`en_pl` when the other language is English). “Known in English” uses the opposite direction. Sentence quiz loads those two directions and no others. A word the user knows only on a different pair is not treated as known here, because that document is not the one this pair practices.

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

Sentence quiz unlocks for the current pair when the generator can build at least **4** sentences whose content words are known on **both** sides. Articles, the copula, and Japanese particles are template grammar, not content words.

The home card shows, for the pair, how many lexicon words are known on each side and whether 4 sentences are ready. Opening the card before unlock shows the lexicon with per-side known toggles and does not start a round. After unlock, the screen can start a round of up to 8 sentences.

### Generation

Content words come from a small curated lexicon, not from raw deck text. Deck lines are citation forms, often with several genders or a wrong part of speech, so filling them into a sentence would be ungrammatical. The lexicon stores the exact surface form each template needs (nominative and accusative noun phrases, a 3rd-person singular verb, predicative adjectives by gender).

Shared index: `public/data/sentences/index.json` (ids, part of speech, semantic tags, deck ids, verb valence, which subjects and objects are allowed).

One file per language, fetched the first time that language is needed and then cached: `public/data/sentences/<code>.json`. It holds the frame strings and the forms. The main bundle does not include them. The home card loads the index and the two selected languages only.

Frames, and only these:

| Frame | Shape | Example (English) |
| --- | --- | --- |
| `vi` | subject + intransitive verb | The cat sleeps. |
| `vt` | subject + transitive verb + object | The child reads the book. |
| `adj` | subject + copula + adjective | The house is big. |

Subject and object restrictions keep the sentences possible: people and animals sleep, only people work and read, eat takes bread, drink takes water, see takes people, animals, places, and things. A verb is not paired with the same noun as both subject and object.

Agreement is data, not a conjugator:

- Each noun stores `npNom`, `npAcc`, and a gender `m` / `f` / `n`. The accusative phrase already includes the article or the personal *a* (*den Freund*, *al amigo*, *książkę*, *друга*). French and Italian elision is part of the stored phrase (*l'école*, *l'acqua*).
- Adjectives store `m`, `f`, and `n`. The renderer picks the subject’s gender. Languages with an uninflected predicative adjective repeat the same string three times (*groß*, *big*, *大きい*).
- Russian present-tense copula is omitted: `Дом большой.`
- Japanese uses topic `は`, object `を`, and the polite verb. The plain verb and the adjective without `です` are extra accepted answers, not the prompt.
- The first character of a Latin or Cyrillic sentence is capitalized. German nouns stay capitalized in the middle of the sentence. Japanese is unchanged.
- A missing form skips that sentence. The renderer never leaves a `{slot}` in the output.

Lexicon (11 nouns, 8 verbs, 4 adjectives): house, dog, child, book, water, school, car, city, cat, bread, friend; sleep, work, wait, read, see, eat, drink, write; big, small, new, good. Deck ids are attached where the catalog already has that concept (`house` → `pl-103` and `de-156`, and the same for the other shared lemmas). Cat, bread, and several verbs are lexicon-only until the user marks them or a later deck happens to use that id.

### Checking a translation

The prompt is the canonical sentence in the prompt language. The answer language contributes one or more full sentences (canonical, Japanese plain-form variants, and any hand-listed alternate of a single slot).

A typed answer is correct when, after folding, it equals one of those sentences. Folding:

- Unicode NFC, trimmed, internal whitespace collapsed, case folded with the answer language’s locale
- the answer language’s existing diacritic rules (Polish marks required, Russian `ё` matches `е`, Japanese macrons ignored on Latin letters)
- curly apostrophes become straight apostrophes
- one trailing run of `.` `!` `?` `。` `？` `！` is removed
- for Japanese, spaces are removed so `猫 は 寝ます` matches `猫は寝ます`

The checker does not strip articles or optional English *the* / *a*. `cat sleeps` is not accepted for `The cat sleeps.`

Sentence rounds show the same style of card, letter bar, and score summary as word quiz, in their own component. A correct or incorrect sentence does not change word accuracy.

### Entry

The app has no router. The sentence screen is a hash route `#sentence`, so a refresh keeps it and the word-quiz session component stays untouched. Leaving the screen clears the hash.

The home panel has its own card, separate from My words and from the Study / Quiz switch. It shows the pair, the known counts, and either “Not ready” or how many sentences are available. The button opens `#sentence`.

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

- every lexicon id has complete forms in all ten language files
- every legal filling renders with no leftover `{` and the right final punctuation
- golden sentences for each language: cat sleeps; child reads book; house is big; water is small (gender: *El agua es pequeña*, *L'eau est petite*, *Woda jest mała*); dog sees friend (accusative: *den Freund*, *al amigo*, *przyjaciela*, *друга*)
- the cat does not “work” or “read”; a noun is not both subject and object
- an unknown content word drops every sentence that needs it
- two correct attempts on the deck ids, on both directions, make that lexicon word eligible
- answer check accepts case, extra spaces, a missing final period, Japanese plain form, and Russian `е` for `ё`; it rejects a missing article, a wrong noun, and Polish without diacritics

Existing unit tests stay as they are.

## UI files

- `src/accuracy/` — stats, local document, debounced remote write, hook
- `src/sentence/` — loaders, generator, checker, home card, sentence screen
- `src/App.tsx` — focus control, `selectCards` at start, `onGraded` on the session, sentence card and `#sentence` screen
- `src/types.ts` — `focus` on settings
- `firestore.rules` — accuracy path
- `README.md` — accuracy, focus, and sentence quiz
