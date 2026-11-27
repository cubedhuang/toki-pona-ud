@preprocessor esmodule

@{%
import {
	makeWord,
	makeNode,
	makeList,
	makeOptionalList,
	makeCoordination,
} from "./tree.js";
import { TokiPonaLexer } from "./lex.js";

const lexer = new TokiPonaLexer();
%}

@lexer lexer

# makeNode(label, head) builds a phrase from the rule's symbols, where head is
# the index of the head symbol, or null if each symbol depends on the
# enclosing phrase's head instead.

Main -> Vocative {% id %}
Main -> Sentence {% id %}
Main -> Vocative Main {% makeNode("main", 1) %}

Vocative -> GeneralSubject WordVocativeMarker {% makeNode("vocative", 0) %}

Sentence -> WordSentenceStarter Sentence {% makeNode("clause", 1) %}
Sentence -> Context Sentence {% makeNode("clause", 1) %}
Sentence -> Clause<any> {% id %}
# Sentence -> Sentence WordEmphasis {% makeNode("clause", 0) %}

Context -> GeneralSubject WordContextMarker {% makeNode("context_phrase", 0) %}
Context -> Clause<strict> WordContextMarker {% makeNode("context_clause", 0) %}

### Clauses

# P {any/strict} is whether or not a predicate is required
Clause<any> -> GeneralSubject {% id %}
Clause<P> -> MarkedSubject Predicates<li> {% makeNode("clause_marked_subject", 1) %}
Clause<P> -> (UnmarkedSubject {% makeNode("subject", 0) %}) Predicates<none> {% makeNode("clause_unmarked_subject", 1) %}
Clause<P> -> GeneralSubject Predicates<o> {% makeNode("clause_optative", 1) %}
Clause<P> -> Predicates<o> {% makeNode("clause_imperative", 0) %}

GeneralSubject -> MarkedSubject {% id %}
GeneralSubject -> UnmarkedSubject {% id %}

MarkedSubject -> WordMarkedSubjectHead {% makeNode("subject", 0) %}
MarkedSubject -> PiPhrase<multiple> {% makeNode("subject", 0) %}
MarkedSubject -> MultipleSubjects<none> {% id %}

# M {none/marked} is whether or not the subject is preceded by "en"
MultipleSubjects<none> -> (Phrase {% makeNode("subject", 0) %}) MultipleSubjects<marked> {% makeCoordination("& subjects") %}
MultipleSubjects<marked> -> EnSubject {% id %}
MultipleSubjects<marked> -> EnSubject MultipleSubjects<marked> {% makeCoordination("& subjects") %}
EnSubject -> SubjectMarker Phrase {% makeNode("subject", 1) %}

SubjectMarker -> WordSubjectMarker {% id %}
SubjectMarker -> WordDisjunctMarker {% id %}

UnmarkedSubject -> WordUnmarkedSubject {% id %}

# M {none/li/o/marked} is what the predicate can be marked with
Predicates<M> -> Predicate<M> {% id %}
Predicates<M> -> Predicate<M> Predicates<marked> {% makeCoordination("& predicates") %}

Predicate<li> -> WordIndicativeMarker PreverbPhrase {% makeNode("predicate", 1) %}
Predicate<o> -> WordDeonticMarker PreverbPhrase {% makeNode("predicate", 1) %}
Predicate<marked> -> WordPredicateMarker PreverbPhrase {% makeNode("predicate", 1) %}
Predicate<none> -> PreverbPhrase {% makeNode("predicate", 0) %}

### Predicates

PreverbPhrase -> Preverb PreverbPhrase {% makeNode("preverb_phrase", 0) %}
PreverbPhrase -> VerbPhrase {% id %}

Preverb -> WordPreverb {% id %}
Preverb -> WordPreverb WordNegator {% makeNode("negated_preverb", 0) %}

# Transitive, intransitive, or prepositional
VerbPhrase -> VerbPhraseTransitive {% id %}
VerbPhrase -> VerbPhraseIntransitive {% id %}
VerbPhrase -> VerbPhrasePrepositional {% id %}

VerbPhraseTransitive -> Phrase Objects {% makeNode("verb_phrase_transitive", 0) %}
VerbPhraseIntransitive -> Phrase {% makeNode("verb_phrase_intransitive", 0) %}
VerbPhraseIntransitive -> Phrase Prepositions {% makeNode("verb_phrase_intransitive", 0) %}
VerbPhrasePrepositional -> PrepositionPhrase {% makeNode("verb_phrase_prepositional", 0) %}
VerbPhrasePrepositional -> PrepositionPhrase Prepositions {% makeNode("verb_phrase_prepositional", 0) %}

Objects -> ObjectPhrase:+ {% makeOptionalList("& objects", null) %}
ObjectPhrase -> Object {% makeNode("object_phrase", null) %}
ObjectPhrase -> Object Prepositions {% makeNode("object_phrase", null) %}
Object -> WordObjectMarker DisjunctPhrase {% makeNode("e", 1) %}

Prepositions -> PrepositionPhrase:+ {% makeOptionalList("& prepositions", null) %}
PrepositionPhrase -> Preposition DisjunctPhrase {% makeNode("preposition_phrase", 1) %}

Preposition -> WordPreposition {% id %}
Preposition -> WordPreposition WordNegator {% makeNode("negated_preposition", 0) %}

### Phrases

DisjunctPhrase -> Phrase {% id %}
DisjunctPhrase -> (Phrase {% makeNode("option", 0) %}) DisjunctPhrases {% makeCoordination("& disjuncts") %}
DisjunctPhrases -> AnuPhrase {% id %}
DisjunctPhrases -> AnuPhrase DisjunctPhrases {% makeCoordination("& disjuncts") %}
AnuPhrase -> WordDisjunctMarker Phrase {% makeNode("option", 1) %}

Phrase -> PiPhrase<any> {% id %}

# M {any/multiple} is whether or not some modifier is required
PiPhrase<M> -> NanpaPhrase<M> {% id %}
PiPhrase<M> -> PiPhrase<any> PiModifier {% makeNode("phrase", 0) %}

PiModifier -> WordRegrouper PiPhrase<multiple> {% makeNode("pi", 1) %}

NanpaPhrase<M> -> SimplePhrase<M> {% id %}
NanpaPhrase<M> -> NanpaPhrase<any> Ordinal {% makeNode("phrase", 0) %}

Ordinal -> WordOrdinalMarker Number {% makeNode("ordinal", 1) %}

SimplePhrase<M> -> SimplePhrase<any> WordModifier {% makeNode("phrase", 0) %}
SimplePhrase<any> -> WordHead {% id %}

Number -> WordNumber:+ {% makeList("number", 0) %}
WordNumber -> %word_number {% makeWord("number") %}

### Words

WordEmphasis -> "a" {% makeWord("emphasis") %}
WordObjectMarker -> "e" {% makeWord("object_marker") %}
WordRegrouper -> "pi" {% makeWord("regrouper") %}
WordOrdinalMarker -> "nanpa" {% makeWord("ordinal_marker") %}
WordContextMarker -> "la" {% makeWord("context_marker") %}
WordSubjectMarker -> "en" {% makeWord("subject_marker") %}
WordNegator -> "ala" WordEmphasis:?  {% makeWord("negator") %}
WordDisjunctMarker -> "anu" {% makeWord("disjunct_marker") %}

WordPredicateMarker -> WordIndicativeMarker {% id %}
WordPredicateMarker -> WordDeonticMarker {% id %}
WordPredicateMarker -> WordDisjunctMarker {% id %}

WordIndicativeMarker -> "li" {% makeWord("indicative_marker") %}
WordDeonticMarker -> "o" {% makeWord("deontic_marker") %}
WordVocativeMarker -> "o" {% makeWord("vocative_marker") %}

WordHead -> WordMarkedSubjectHead {% id %}
WordHead -> WordUnmarkedSubject {% id %}

WordMarkedSubjectHead -> %word_content {% makeWord("content") %}
WordMarkedSubjectHead -> %word_preposition {% makeWord("content") %}
WordMarkedSubjectHead -> %word_preverb {% makeWord("content") %}
WordMarkedSubjectHead -> %word_number {% makeWord("content") %}
WordUnmarkedSubject -> %word_unmarked_subject {% makeWord("content") %}

WordModifier -> %word_modifier_only {% makeWord("content") %}
WordModifier -> WordEmphasis {% id %}
WordModifier -> WordHead {% id %}

WordPreverb -> %word_preverb WordEmphasis:? {% makeWord("preverb") %}
WordPreposition -> %word_preposition WordEmphasis:? {% makeWord("preposition") %}

WordSentenceStarter -> "taso" WordEmphasis:? {% makeWord("sentence_starter") %}
WordSentenceStarter -> "kin" WordEmphasis:? {% makeWord("sentence_starter") %}
WordSentenceStarter -> "n" WordEmphasis:? {% makeWord("sentence_starter") %}
WordSentenceStarter -> "a" {% makeWord("sentence_starter") %}
