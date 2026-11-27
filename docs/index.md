---
layout: base
title: "Toki Pona UD"
udver: "2"
---

# UD for Toki Pona <span class="flagspan"><img class="flag" src="../../flags/svg/AQ.svg" /></span>

## Tokenization and Word Segmentation

- In general, words are delimited by whitespace characters or punctuation.

<!--**Instruction**: Describe the general rules for delimiting words (for example, based on whitespace and punctuation) and exceptions to these rules. Specify whether words with spaces and/or multiword tokens occur. Include links to further language-specific documentation if available.-->

## Morphology

### Tags

- Toki Pona uses all 17 universal tags.

<!--**Instruction**: Specify any unused tags. Explain what words are tagged as PART. Describe how the AUX-VERB and DET-PRON distinctions are drawn, and specify whether there are (de)verbal forms tagged as ADJ, ADV or NOUN. Include links to language-specific tag definitions if any.-->

### Features

- Toki Pona has no inflection; nouns are not inflected for number, and verbs are not inflected for tense, aspect, mood, or person.
- All content words in Toki Pona may undergo zero derivation to act as nouns, verbs, and adjectives. As such, word order is the only factor used to differentiate between [NOUN](<>), [VERB](<>), [ADJ](<>), and [ADJ](<>) with one exception:
  - When intransitive, the main predicate of the sentence may be a `NOUN`, `VERB`, or `ADJ` depending on its lexical part of speech.

<!--**Instruction**: Describe inherent and inflectional features for major word classes (at least NOUN and VERB). Describe other noteworthy features. Include links to language-specific feature definitions if any.-->

## Syntax

- Subjects have the following characteristics:
  - Word order: Subjects immediately precede _li_ or _o_.
  - Case marking: Subjects receive no case marking.
- Objects have the following characteristics:
  - Word order: Objects immediately follow the main verb.
  - Case marking: Objects are preceded by the preposition _e_.

<!--**Instruction**: Give criteria for identifying core arguments (subjects and objects), and describe the range of copula constructions in nonverbal clauses. List all subtype relations used. Include links to language-specific relations definitions if any.-->

## Treebanks

There are [N](../treebanks/tok-comparison.html) Toki Pona UD treebanks:

- [Toki Pona-A](../treebanks/tok_a/index.html)
- [Toki Pona-B](../treebanks/tok_b/index.html)

<!--**Instruction**: Treebank-specific pages are generated automatically from the README file in the treebank repository and
from the data in the latest release. Link to the respective `*-index.html` page in the `treebanks` folder, using the language code
and the treebank code in the file name.-->
