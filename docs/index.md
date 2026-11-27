---
layout: base
title: "Toki Pona UD"
udver: "2"
---

# UD for Toki Pona <span class="flagspan"><img class="flag" src="../../flags/svg/AQ.svg" /></span>

## Tokenization and Word Segmentation

- In general, words are delimited by whitespace characters or punctuation.

### Sentence Segmentation

- Sentences are ended by periods, question marks, exclamation marks, colors, semicolons, and ellipses.
- Brackets and dashes do not end sentences. See [Parentheticals](#parentheticals).

<!--**Instruction**: Describe the general rules for delimiting words (for example, based on whitespace and punctuation) and exceptions to these rules. Specify whether words with spaces and/or multiword tokens occur. Include links to further language-specific documentation if available.-->

## Morphology

### Tags

- Toki Pona uses all 17 universal tags.
- [ADP](<>) is used for:
  - Prepositions: _lon_, _tawa_, _tan_, _kepeken_, _sama_.
  - The accusative marker _e_.
  - The vocative marker _o_.
  - The regrouping preposition _pi_.
- [AUX](<>) is used for the predicate markers _li_ and _o_.
- [VERB](<>) is used for preverbs.
- [X](<>) is used for foreign words that can’t be given a part of speech, usually in parenthetical glosses, like (七巧板).

<!--**Instruction**: Specify any unused tags. Explain what words are tagged as PART. Describe how the AUX-VERB and DET-PRON distinctions are drawn, and specify whether there are (de)verbal forms tagged as ADJ, ADV or NOUN. Include links to language-specific tag definitions if any.-->

### Features

- Toki Pona has no inflection; nouns are not inflected for number, and verbs are not inflected for tense, aspect, mood, or person.
- Mood is marked solely on predicate markers.
  - _li_ is `Mood=Ind`.
  - _o_ with no explicit subject is `Mood=Imp`.
  - _o_ with a subject is `Mood=Opt`.
- Content words have no mood, and when _li_ is omitted after a sole _mi_ or _sina_, no token is marked for mood.

<!--- All content words in Toki Pona may undergo zero derivation to act as nouns, verbs, and adjectives. As such, word order is the only factor used to differentiate between [NOUN](<>), [VERB](<>), [ADJ](<>), and [ADV](<>) with one exception:
  - When intransitive, the main predicate of the sentence may be a `NOUN`, `VERB`, or `ADJ` depending on its lexical part of speech.-->

<!--**Instruction**: Describe inherent and inflectional features for major word classes (at least NOUN and VERB). Describe other noteworthy features. Include links to language-specific feature definitions if any.-->

## Syntax

- _li_ and _o_ are both AUX and have the [aux](<>) relationship with the predicate.
- Toki Pona has no copula, so in nonverbal clauses, the nominal or adjectival predicate is the head and _li_ attaches to it as `aux`.
- Subjects have the following characteristics:
  - Word order: Subjects come first in the clause, after any _la_ phrases, and before _li_ or _o_ when either are present.
  - Case marking: Subjects receive no case marking.
  - Subjects may be omitted in imperatives.
- Objects have the following characteristics:
  - Word order: Objects follow the predicate and its modifiers.
  - Case marking: Objects are preceded by the preposition _e_.
- Preverbs (_wile_, _ken_, _kama_, _awen_, _sona_, _alasa_, _open_, _pini_, and _lukin_) are tagged as VERB. The verb after a preverb is its [xcomp](<>).

<!--**Instruction**: Give criteria for identifying core arguments (subjects and objects), and describe the range of copula constructions in nonverbal clauses. List all subtype relations used. Include links to language-specific relations definitions if any.-->

## Treebanks

There are [N](../treebanks/tok-comparison.html) Toki Pona UD treebanks:

- [Toki Pona-A](../treebanks/tok_a/index.html)
- [Toki Pona-B](../treebanks/tok_b/index.html)

<!--**Instruction**: Treebank-specific pages are generated automatically from the README file in the treebank repository and
from the data in the latest release. Link to the respective `*-index.html` page in the `treebanks` folder, using the language code
and the treebank code in the file name.-->
