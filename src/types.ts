export type DifficultyLevel = 'Principiante' | 'Intermedio' | 'Avanzado';

export type TurnType =
  | 'TOPIC_SELECTION'
  | 'INTERLOCUTOR_TURN'
  | 'STUDENT_PHRASE'
  | 'TRANSLATION'
  | 'CORRECTION'
  | 'PRAISE_AND_NEXT'
  | 'EXPLANATION'
  | 'SINGLE_WORD'
  | 'DIVIDED_PHRASE'
  | 'REPEAT_OR_SLOW';

export type AudioSpeed = 'normal' | 'slow';

export type TradeVisualId = 'framing' | 'drywall' | 'plumbing' | 'electrical';

export interface TranslationItem {
  speaker: string;
  english: string;
  pronunciation: string;
  spanish: string;
}

export interface TranslationPair {
  interlocutor: TranslationItem;
  student: TranslationItem;
}

export interface PhraseSegment {
  english: string;
  noteSpanish?: string;
}

export interface MemoryState {
  topic: string;
  characters: string;
  context: string;
  lastInterlocutorSpeaker: string;
  lastInterlocutorPhrase: string;
  lastStudentPhrase: string;
  difficultyLevel: DifficultyLevel;
  recurringErrors: string[];
  turnCount: number;
  practicedPhrasesCount: number;
  correctionsCount: number;
  completedTopics: string[];
}

export interface TutorResponse {
  turnType: TurnType;
  spanishIntro?: string;
  speakerName?: string;
  englishPhrase?: string;
  translationPair?: TranslationPair;
  segments?: PhraseSegment[];
  suggestedTopics?: string[];
  visualTradeId?: TradeVisualId;
  audioAction?: 'play_normal' | 'play_slow' | 'none';
  memoryUpdate: {
    topic: string;
    characters: string;
    context: string;
    lastInterlocutorSpeaker: string;
    lastInterlocutorPhrase: string;
    lastStudentPhrase: string;
    difficultyLevel: DifficultyLevel;
    recurringErrorToAdd?: string;
    turnCountIncrement: number;
    practicedPhraseIncrement: number;
    correctionIncrement: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'student' | 'tutor';
  timestamp: number;
  studentText?: string;
  viaVoice?: boolean;
  tutorData?: TutorResponse;
}

export interface SavedItem {
  id: string;
  english: string;
  pronunciation?: string;
  spanish?: string;
  topic: string;
  speakerRole?: string;
  errorSummary?: string;
  kind: 'phrase' | 'error';
  status: 'pendiente' | 'practicado' | 'dominado';
  updatedAtMs?: number;
}

export type DeckTab =
  | 'contexto'
  | 'temas'
  | 'comandos'
  | 'repaso'
  | 'visual'
  | 'progreso';
