/** Corpus port barrel — the single import surface for both `../
 * settings.ts` (block-type/language validation) and the future block generators.
 */
export * from "./block-types";
export type {
  AnimalFactEntry,
  PhonicsWordEntry,
  NumberFactEntry,
  QuoteEntry,
  RiddleEntry,
  TextEntry,
  TriviaEntry,
  VocabularyEntry,
  WordSearchCorpusShape,
  WordSearchDifficulty,
  WouldYouRatherEntry,
} from "./types";
export { hashSeed, fisherYates, seededRandom, withSeededMathRandom } from "./determinism";
export {
  animalFactsCorpus,
  dadJokesCorpus,
  drawingPromptsCorpus,
  phonicsCorpus,
  getWordSearchPool,
  numberFactsCorpus,
  quotesEsCorpus,
  riddlesCorpus,
  triviaCorpus,
  vocabularyCorpus,
  wouldYouRathersCorpus,
} from "./loader";
