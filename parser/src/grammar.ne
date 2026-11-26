@preprocessor esmodule

@{%
import {
	makeLeaf,
	makeNode,
	makeList,
	makeOptionalList,
	makeCoordination,
} from "./tree.js";
import { TokiPonaLexer } from "./lex.js";

const lexer = new TokiPonaLexer();
%}

@lexer lexer

Main -> Vocative {% id %}
Main -> Sentence {% id %}
Main -> Vocative Main {% makeNode("main") %}

Vocative -> GeneralSubject WordVocativeMarker {% makeNode("vocative") %}

Sentence -> WordSentenceStarter Sentence {% makeNode("clause") %}
Sentence -> Context Sentence {% makeNode("clause") %}
Sentence -> Clause<any> {% id %}
# Sentence -> Sentence WordEmphasis {% makeNode("clause") %}

Context -> GeneralSubject WordContextMarker {% makeNode("context_phrase") %}
Context -> Clause<strict> WordContextMarker {% makeNode("context_clause") %}

### Clauses

# P {any/strict} is whether or not a predicate is required
Clause<any> -> GeneralSubject {% id %}
Clause<P> -> MarkedSubject Predicates<li> {% makeNode("clause_marked_subject") %}
Clause<P> -> (UnmarkedSubject {% makeNode("subject") %}) Predicates<none> {% makeNode("clause_unmarked_subject") %}
Clause<P> -> GeneralSubject Predicates<o> {% makeNode("clause_optative") %}
Clause<P> -> Predicates<o> {% makeNode("clause_imperative") %}

GeneralSubject -> MarkedSubject {% id %}
GeneralSubject -> UnmarkedSubject {% id %}

MarkedSubject -> (WordMarkedSubjectHead {% makeNode("head") %}) {% makeNode("subject") %}
MarkedSubject -> PiPhrase<multiple> {% makeNode("subject") %}
MarkedSubject -> MultipleSubjects<none> {% id %}

# M {none/marked} is whether or not the subject is preceded by "en"
MultipleSubjects<none> -> (Phrase {% makeNode("subject") %}) MultipleSubjects<marked> {% makeCoordination("& subjects") %}
MultipleSubjects<marked> -> EnSubject {% id %}
MultipleSubjects<marked> -> EnSubject MultipleSubjects<marked> {% makeCoordination("& subjects") %}
EnSubject -> SubjectMarker Phrase {% makeNode("subject") %}

SubjectMarker -> WordSubjectMarker {% id %}
SubjectMarker -> WordDisjunctMarker {% id %}

UnmarkedSubject -> WordUnmarkedSubject {% makeNode("head") %}

# M {none/li/o/marked} is what the predicate can be marked with
Predicates<M> -> Predicate<M> {% id %}
Predicates<M> -> Predicate<M> Predicates<marked> {% makeCoordination("& predicates") %}

Predicate<li> -> WordIndicativeMarker PreverbPhrase {% makeNode("predicate") %}
Predicate<o> -> WordDeonticMarker PreverbPhrase {% makeNode("predicate") %}
Predicate<marked> -> WordPredicateMarker PreverbPhrase {% makeNode("predicate") %}
Predicate<none> -> PreverbPhrase {% makeNode("predicate") %}

### Predicates

PreverbPhrase -> Preverb PreverbPhrase {% makeNode("preverb_phrase") %}
PreverbPhrase -> VerbPhrase {% id %}

Preverb -> WordPreverb {% id %}
Preverb -> WordPreverb WordNegator {% makeNode("pv") %}

# Transitive, intransitive, or prepositional
VerbPhrase -> VerbPhraseTransitive {% id %}
VerbPhrase -> VerbPhraseIntransitive {% id %}
VerbPhrase -> VerbPhrasePrepositional {% id %}

VerbPhraseTransitive -> Phrase Objects {% makeNode("verb_phrase_transitive") %}
VerbPhraseIntransitive -> Phrase {% makeNode("verb_phrase_intransitive") %}
VerbPhraseIntransitive -> Phrase Prepositions {% makeNode("verb_phrase_intransitive") %}
VerbPhrasePrepositional -> PrepositionPhrase {% makeNode("verb_phrase_prepositional") %}
VerbPhrasePrepositional -> PrepositionPhrase Prepositions {% makeNode("verb_phrase_prepositional") %}

Objects -> ObjectPhrase:+ {% makeOptionalList("& objects") %}
ObjectPhrase -> Object {% makeNode("object_phrase") %}
ObjectPhrase -> Object Prepositions {% makeNode("object_phrase") %}
Object -> WordObjectMarker DisjunctPhrase {% makeNode("e") %}

Prepositions -> PrepositionPhrase:+ {% makeOptionalList("& prepositions") %}
PrepositionPhrase -> Preposition DisjunctPhrase {% makeNode("preposition_phrase") %}

Preposition -> WordPreposition {% id %}
Preposition -> WordPreposition WordNegator {% makeNode("prep") %}

### Phrases

DisjunctPhrase -> Phrase {% id %}
DisjunctPhrase -> (Phrase {% makeNode("option") %}) DisjunctPhrases {% makeCoordination("& disjuncts") %}
DisjunctPhrases -> AnuPhrase {% id %}
DisjunctPhrases -> AnuPhrase DisjunctPhrases {% makeCoordination("& disjuncts") %}
AnuPhrase -> WordDisjunctMarker Phrase {% makeNode("option") %}

Phrase -> PiPhrase<any> {% id %}

# M {any/multiple} is whether or not some modifier is required
PiPhrase<M> -> NanpaPhrase<M> {% id %}
PiPhrase<M> -> PiPhrase<any> PiModifier {% makeNode("phrase") %}

PiModifier -> WordRegrouper PiPhrase<multiple> {% makeNode("pi") %}

NanpaPhrase<M> -> SimplePhrase<M> {% id %}
NanpaPhrase<M> -> NanpaPhrase<any> Ordinal {% makeNode("phrase") %}

Ordinal -> WordOrdinalMarker Number {% makeNode("ordinal") %}

SimplePhrase<M> -> SimplePhrase<any> WordModifier {% makeNode("phrase") %}
SimplePhrase<any> -> WordHead {% makeNode("head") %}

Number -> WordNumber:+ {% makeList("number") %}
WordNumber -> %word_number {% makeLeaf("#") %}

### Words

WordEmphasis -> "a" {% makeLeaf("emph") %}
WordObjectMarker -> "e" {% makeLeaf("obj") %}
WordRegrouper -> "pi" {% makeLeaf("regroup") %}
WordOrdinalMarker -> "nanpa" {% makeLeaf("ord") %}
WordContextMarker -> "la" {% makeLeaf("ctx") %}
WordSubjectMarker -> "en" {% makeLeaf("conj") %}
WordNegator -> "ala" WordEmphasis:?  {% makeLeaf("neg") %}
WordDisjunctMarker -> "anu" {% makeLeaf("or") %}

WordPredicateMarker -> WordIndicativeMarker {% id %}
WordPredicateMarker -> WordDeonticMarker {% id %}
WordPredicateMarker -> WordDisjunctMarker {% id %}

WordIndicativeMarker -> "li" {% makeLeaf("ind") %}
WordDeonticMarker -> "o" {% makeLeaf("deo") %}
WordVocativeMarker -> "o" {% makeLeaf("voc") %}

WordHead -> WordMarkedSubjectHead {% id %}
WordHead -> WordUnmarkedSubject {% id %}

WordMarkedSubjectHead -> %word_content {% makeLeaf("cont") %}
WordMarkedSubjectHead -> %word_preposition {% makeLeaf("cont") %}
WordMarkedSubjectHead -> %word_preverb {% makeLeaf("cont") %}
WordMarkedSubjectHead -> %word_number {% makeLeaf("cont") %}
WordUnmarkedSubject -> %word_unmarked_subject {% makeLeaf("cont") %}

WordModifier -> %word_modifier_only {% makeLeaf("cont") %}
WordModifier -> WordEmphasis {% id %}
WordModifier -> WordHead {% id %}

WordPreverb -> %word_preverb WordEmphasis:? {% makeLeaf("pv") %}
WordPreposition -> %word_preposition WordEmphasis:? {% makeLeaf("prep") %}

WordSentenceStarter -> "taso" WordEmphasis:? {% makeLeaf("start") %}
WordSentenceStarter -> "kin" WordEmphasis:? {% makeLeaf("start") %}
WordSentenceStarter -> "n" WordEmphasis:? {% makeLeaf("start") %}
WordSentenceStarter -> WordEmphasis {% makeNode("start") %}
