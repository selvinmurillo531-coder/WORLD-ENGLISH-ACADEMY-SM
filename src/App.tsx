import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Mic, Square, Loader2, PhoneCall, Headphones } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutAccount,
  testFirestoreConnection,
} from './firebase';
import { TopBar } from './components/TopBar';
import { MessageBlock } from './components/MessageBlock';
import { ControlDeck } from './components/ControlDeck';
import { LiveVoiceModal } from './components/LiveVoiceModal';
import type { ActiveAudioState } from './components/AudioControls';
import type {
  AudioSpeed,
  ChatMessage,
  DeckTab,
  DifficultyLevel,
  MemoryState,
  SavedItem,
  TradeVisualId,
  TutorResponse,
} from './types';

const STORAGE_KEY = 'world_english_academy_sm_v2';

const INITIAL_TOPICS = [
  'Construcción y carpintería',
  'Instalación de drywall o sheetrock',
  'Plomería',
  'Electricidad',
  'Restaurantes',
  'Medicina',
  'Viajes',
  'Negocios',
  'Tecnología',
  'Conversaciones cotidianas',
];

const INITIAL_MEMORY: MemoryState = {
  topic: '',
  characters: '',
  context: '',
  lastInterlocutorSpeaker: '',
  lastInterlocutorPhrase: '',
  lastStudentPhrase: '',
  difficultyLevel: 'Principiante',
  recurringErrors: [],
  turnCount: 0,
  practicedPhrasesCount: 0,
  correctionsCount: 0,
  completedTopics: [],
};

function createInitialGreeting(): ChatMessage {
  return {
    id: 'msg-initial-greeting',
    role: 'tutor',
    timestamp: Date.now(),
    tutorData: {
      turnType: 'TOPIC_SELECTION',
      spanishIntro: '¿Qué tema quieres aprender y practicar en inglés?',
      suggestedTopics: INITIAL_TOPICS,
      audioAction: 'none',
      memoryUpdate: {
        topic: '',
        characters: '',
        context: '',
        lastInterlocutorSpeaker: '',
        lastInterlocutorPhrase: '',
        lastStudentPhrase: '',
        difficultyLevel: 'Principiante',
        turnCountIncrement: 0,
        practicedPhraseIncrement: 0,
        correctionIncrement: 0,
      },
    },
  };
}

const QUICK_COMMANDS = [
  'Mi frase',
  'Traducción',
  'Repítela',
  'Más despacio',
  'Divídela',
  'Explícame',
  'Otra conversación',
];

function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function clampStr(val: string | undefined, max: number): string {
  return (val || '').slice(0, max);
}

function makeDocId(prefix: string, seed: string): string {
  const clean = seed
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
  return `${prefix}_${clean || Date.now()}`;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncLabel, setSyncLabel] = useState('Modo local (sin cuenta)');
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return parsed.messages;
        }
      }
    } catch {
      // ignore corrupted storage
    }
    return [createInitialGreeting()];
  });

  const [memory, setMemory] = useState<MemoryState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.memory) {
          return { ...INITIAL_MEMORY, ...parsed.memory };
        }
      }
    } catch {
      // ignore corrupted storage
    }
    return INITIAL_MEMORY;
  });

  const [savedItems, setSavedItems] = useState<SavedItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.savedItems)) {
          return parsed.savedItems;
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [handsFreeMode, setHandsFreeMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DeckTab>('contexto');
  const [selectedTrade, setSelectedTrade] = useState<TradeVisualId>('framing');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isLoadingTurn, setIsLoadingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Audio playback state & cache
  const [audioState, setAudioState] = useState<ActiveAudioState>({
    playingKey: null,
    loadingKey: null,
    errorKey: null,
    errorMessage: null,
  });
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map());
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Refs for hands-free callbacks
  const handsFreeRef = useRef(handsFreeMode);
  useEffect(() => {
    handsFreeRef.current = handsFreeMode;
  }, [handsFreeMode]);

  const savedEnglishSet = useMemo(() => {
    return new Set(savedItems.map((item) => item.english.trim().toLowerCase()));
  }, [savedItems]);

  // Persist guest local backup
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages: messages.slice(-30), memory, savedItems })
      );
    } catch {
      // storage quota exceeded
    }
  }, [messages, memory, savedItems]);

  // Test Firestore connectivity on startup
  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  // Firebase Auth & Firestore Subscriptions
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    let unsubSessionDoc: (() => void) | null = null;
    let unsubSavedQuery: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      unsubUserDoc?.();
      unsubSessionDoc?.();
      unsubSavedQuery?.();

      if (!firebaseUser) {
        setSyncLabel('Modo local (sin cuenta)');
        return;
      }

      setSyncLabel('Sincronizando nube...');
      const uid = firebaseUser.uid;
      const userDocRef = doc(db, 'users', uid);
      const sessionDocRef = doc(db, 'users', uid, 'sessions', 'active');

      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          await setDoc(userDocRef, {
            uid,
            email: clampStr(firebaseUser.email || '', 254),
            displayName: clampStr(firebaseUser.displayName || 'Estudiante', 120),
            preferredLevel: memory.difficultyLevel,
            handsFreeMode,
            turnCount: memory.turnCount,
            practicedPhrasesCount: memory.practicedPhrasesCount,
            correctionsCount: memory.correctionsCount,
            completedTopics: memory.completedTopics.slice(0, 30).map((t) => clampStr(t, 160)),
            recurringErrors: memory.recurringErrors.slice(0, 20).map((e) => clampStr(e, 160)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await setDoc(sessionDocRef, {
            uid,
            topic: clampStr(memory.topic, 120),
            characters: clampStr(memory.characters, 200),
            context: clampStr(memory.context, 500),
            lastInterlocutorSpeaker: clampStr(memory.lastInterlocutorSpeaker, 80),
            lastInterlocutorPhrase: clampStr(memory.lastInterlocutorPhrase, 400),
            lastStudentPhrase: clampStr(memory.lastStudentPhrase, 400),
            difficultyLevel: memory.difficultyLevel,
            turnCount: memory.turnCount,
            recentMessages: stripUndefined(messages.slice(-30)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
        } catch (wrapped) {
          setFirestoreError(
            wrapped instanceof Error ? wrapped.message : 'Error al sincronizar perfil.'
          );
        }
      }

      unsubUserDoc = onSnapshot(
        userDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const d = snapshot.data();
            setHandsFreeMode(Boolean(d.handsFreeMode));
            setMemory((prev) => ({
              ...prev,
              difficultyLevel: (d.preferredLevel as DifficultyLevel) || prev.difficultyLevel,
              turnCount: typeof d.turnCount === 'number' ? d.turnCount : prev.turnCount,
              practicedPhrasesCount:
                typeof d.practicedPhrasesCount === 'number'
                  ? d.practicedPhrasesCount
                  : prev.practicedPhrasesCount,
              correctionsCount:
                typeof d.correctionsCount === 'number'
                  ? d.correctionsCount
                  : prev.correctionsCount,
              completedTopics: Array.isArray(d.completedTopics)
                ? d.completedTopics
                : prev.completedTopics,
              recurringErrors: Array.isArray(d.recurringErrors)
                ? d.recurringErrors
                : prev.recurringErrors,
            }));
            setSyncLabel('Sincronizado en la nube');
          }
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, `users/${uid}`);
          } catch {
            setSyncLabel('Error de sincronización');
          }
        }
      );

      unsubSessionDoc = onSnapshot(
        sessionDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const d = snapshot.data();
            if (Array.isArray(d.recentMessages) && d.recentMessages.length > 0) {
              setMessages(d.recentMessages as ChatMessage[]);
            }
            setMemory((prev) => ({
              ...prev,
              topic: typeof d.topic === 'string' ? d.topic : prev.topic,
              characters:
                typeof d.characters === 'string' ? d.characters : prev.characters,
              context: typeof d.context === 'string' ? d.context : prev.context,
              lastInterlocutorSpeaker:
                typeof d.lastInterlocutorSpeaker === 'string'
                  ? d.lastInterlocutorSpeaker
                  : prev.lastInterlocutorSpeaker,
              lastInterlocutorPhrase:
                typeof d.lastInterlocutorPhrase === 'string'
                  ? d.lastInterlocutorPhrase
                  : prev.lastInterlocutorPhrase,
              lastStudentPhrase:
                typeof d.lastStudentPhrase === 'string'
                  ? d.lastStudentPhrase
                  : prev.lastStudentPhrase,
              difficultyLevel:
                (d.difficultyLevel as DifficultyLevel) || prev.difficultyLevel,
            }));
          }
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, `users/${uid}/sessions/active`);
          } catch {
            setSyncLabel('Error de sincronización');
          }
        }
      );

      const savedQuery = query(
        collection(db, 'users', uid, 'savedItems'),
        where('uid', '==', uid)
      );
      unsubSavedQuery = onSnapshot(
        savedQuery,
        (snapshot) => {
          const items: SavedItem[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            items.push({
              id: docSnap.id,
              english: String(d.english || ''),
              pronunciation: d.pronunciation ? String(d.pronunciation) : undefined,
              spanish: d.spanish ? String(d.spanish) : undefined,
              topic: String(d.topic || 'General'),
              speakerRole: d.speakerRole ? String(d.speakerRole) : undefined,
              errorSummary: d.errorSummary ? String(d.errorSummary) : undefined,
              kind: d.kind === 'error' ? 'error' : 'phrase',
              status:
                d.status === 'dominado'
                  ? 'dominado'
                  : d.status === 'practicado'
                    ? 'practicado'
                    : 'pendiente',
            });
          });
          setSavedItems(items);
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `users/${uid}/savedItems`);
          } catch {
            // handled
          }
        }
      );
    });

    return () => {
      unsubAuth();
      unsubUserDoc?.();
      unsubSessionDoc?.();
      unsubSavedQuery?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncStateToFirestore = useCallback(
    async (
      nextMemory: MemoryState,
      nextMessages: ChatMessage[],
      nextHandsFree: boolean
    ) => {
      if (!user) return;
      const uid = user.uid;
      const userDocRef = doc(db, 'users', uid);
      const sessionDocRef = doc(db, 'users', uid, 'sessions', 'active');

      try {
        await updateDoc(userDocRef, {
          preferredLevel: nextMemory.difficultyLevel,
          handsFreeMode: nextHandsFree,
          turnCount: nextMemory.turnCount,
          practicedPhrasesCount: nextMemory.practicedPhrasesCount,
          correctionsCount: nextMemory.correctionsCount,
          completedTopics: nextMemory.completedTopics
            .slice(0, 30)
            .map((t) => clampStr(t, 160)),
          recurringErrors: nextMemory.recurringErrors
            .slice(0, 20)
            .map((e) => clampStr(e, 160)),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
        } catch {
          // ignore silent UI interruption
        }
      }

      const sessionPayload = {
        uid,
        topic: clampStr(nextMemory.topic, 120),
        characters: clampStr(nextMemory.characters, 200),
        context: clampStr(nextMemory.context, 500),
        lastInterlocutorSpeaker: clampStr(nextMemory.lastInterlocutorSpeaker, 80),
        lastInterlocutorPhrase: clampStr(nextMemory.lastInterlocutorPhrase, 400),
        lastStudentPhrase: clampStr(nextMemory.lastStudentPhrase, 400),
        difficultyLevel: nextMemory.difficultyLevel,
        turnCount: nextMemory.turnCount,
        recentMessages: stripUndefined(nextMessages.slice(-30)),
      };

      try {
        const snap = await getDoc(sessionDocRef);
        if (snap.exists()) {
          await updateDoc(sessionDocRef, {
            topic: sessionPayload.topic,
            characters: sessionPayload.characters,
            context: sessionPayload.context,
            lastInterlocutorSpeaker: sessionPayload.lastInterlocutorSpeaker,
            lastInterlocutorPhrase: sessionPayload.lastInterlocutorPhrase,
            lastStudentPhrase: sessionPayload.lastStudentPhrase,
            difficultyLevel: sessionPayload.difficultyLevel,
            turnCount: sessionPayload.turnCount,
            recentMessages: sessionPayload.recentMessages,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(sessionDocRef, {
            ...sessionPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}/sessions/active`);
        } catch {
          // handled
        }
      }
    },
    [user]
  );

  // Smooth scroll to latest turn
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingTurn]);

  // Clean up object URLs and audio on unmount
  useEffect(() => {
    const cache = audioUrlCacheRef.current;
    return () => {
      if (activeAudioElRef.current) {
        activeAudioElRef.current.pause();
      }
      cache.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (activeAudioElRef.current) {
      activeAudioElRef.current.pause();
      activeAudioElRef.current.currentTime = 0;
      activeAudioElRef.current = null;
    }
    setAudioState((prev) => ({
      ...prev,
      playingKey: null,
    }));
  }, []);

  const startVoiceRecording = useCallback(
    async (onTranscribed: (text: string) => void) => {
      setVoiceError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          if (audioBlob.size < 400) {
            setVoiceError('El audio grabado fue demasiado corto. Intenta de nuevo.');
            return;
          }

          setIsTranscribing(true);
          try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1] || '');
              };
              reader.onerror = () => reject(new Error('No se pudo leer el audio.'));
            });
            reader.readAsDataURL(audioBlob);
            const audioBase64 = await base64Promise;

            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64, mimeType }),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Error al transcribir tu voz.');
            }

            if (data.text && data.text.trim()) {
              onTranscribed(data.text.trim());
            } else {
              setVoiceError('No se detectó voz clara. Intenta hablar más cerca del micrófono.');
            }
          } catch (err: unknown) {
            setVoiceError(
              err instanceof Error ? err.message : 'Error al procesar el audio.'
            );
          } finally {
            setIsTranscribing(false);
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
      } catch {
        setVoiceError(
          'No se pudo acceder al micrófono. Verifica los permisos del navegador.'
        );
      }
    },
    []
  );

  const sendMessageRef = useRef<(rawText: string, viaVoice?: boolean) => Promise<void>>(
    async () => {}
  );

  const playAudio = useCallback(
    async (
      phrase: string,
      speed: AudioSpeed,
      trackKey: string,
      speakerName?: string,
      triggerHandsFreeAfter = false
    ) => {
      const cleanPhrase = phrase.trim();
      if (!cleanPhrase) return;

      stopAudio();

      const cacheKey = `${cleanPhrase}::${speed}::${memory.difficultyLevel}::${speakerName || 'Profesor'}`;
      let audioUrl = audioUrlCacheRef.current.get(cacheKey);

      if (!audioUrl) {
        setAudioState({
          playingKey: null,
          loadingKey: trackKey,
          errorKey: null,
          errorMessage: null,
        });

        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: cleanPhrase,
              speed,
              level: memory.difficultyLevel,
              speakerName: speakerName || 'Profesor',
            }),
          });

          const data = await res.json();
          if (!res.ok || !data.audioBase64) {
            throw new Error(data.error || 'No se pudo generar el audio.');
          }

          const byteChars = atob(data.audioBase64);
          const byteNumbers = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: data.mimeType || 'audio/wav' });
          audioUrl = URL.createObjectURL(blob);
          audioUrlCacheRef.current.set(cacheKey, audioUrl);
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : 'Error al generar el audio.';
          setAudioState({
            playingKey: null,
            loadingKey: null,
            errorKey: trackKey,
            errorMessage: msg,
          });
          return;
        }
      }

      const audio = new Audio(audioUrl);
      activeAudioElRef.current = audio;

      setAudioState({
        playingKey: trackKey,
        loadingKey: null,
        errorKey: null,
        errorMessage: null,
      });

      audio.onended = () => {
        if (activeAudioElRef.current === audio) {
          activeAudioElRef.current = null;
        }
        setAudioState((prev) =>
          prev.playingKey === trackKey ? { ...prev, playingKey: null } : prev
        );
        if (triggerHandsFreeAfter && handsFreeRef.current && !isRecording) {
          void startVoiceRecording((transcribed) => {
            void sendMessageRef.current(transcribed, true);
          });
        }
      };

      audio.onerror = () => {
        if (activeAudioElRef.current === audio) {
          activeAudioElRef.current = null;
        }
        setAudioState({
          playingKey: null,
          loadingKey: null,
          errorKey: trackKey,
          errorMessage: 'No se pudo reproducir el audio.',
        });
      };

      try {
        await audio.play();
      } catch {
        setAudioState((prev) => ({
          ...prev,
          playingKey: null,
        }));
      }
    },
    [isRecording, memory.difficultyLevel, startVoiceRecording, stopAudio]
  );

  const upsertSavedItem = useCallback(
    async (payload: {
      english: string;
      pronunciation?: string;
      spanish?: string;
      speakerRole?: string;
      errorSummary?: string;
      kind: 'phrase' | 'error';
    }) => {
      const cleanEnglish = clampStr(payload.english.trim(), 400);
      if (!cleanEnglish) return;

      const docId = makeDocId(payload.kind, cleanEnglish);
      const itemData: SavedItem = {
        id: docId,
        english: cleanEnglish,
        pronunciation: payload.pronunciation
          ? clampStr(payload.pronunciation, 400)
          : undefined,
        spanish: payload.spanish ? clampStr(payload.spanish, 400) : undefined,
        topic: clampStr(memory.topic || 'General', 120),
        speakerRole: payload.speakerRole
          ? clampStr(payload.speakerRole, 80)
          : undefined,
        errorSummary: payload.errorSummary
          ? clampStr(payload.errorSummary, 300)
          : undefined,
        kind: payload.kind,
        status: 'pendiente',
        updatedAtMs: Date.now(),
      };

      setSavedItems((prev) => {
        const exists = prev.some((i) => i.id === docId);
        if (exists) {
          return prev.map((i) => (i.id === docId ? { ...i, ...itemData } : i));
        }
        return [itemData, ...prev];
      });

      if (user) {
        const itemRef = doc(db, 'users', user.uid, 'savedItems', docId);
        try {
          const existingSnap = await getDoc(itemRef);
          if (existingSnap.exists()) {
            const updatePayload: Record<string, unknown> = {
              status: 'pendiente',
              updatedAt: serverTimestamp(),
            };
            if (itemData.pronunciation) {
              updatePayload.pronunciation = itemData.pronunciation;
            }
            if (itemData.spanish) {
              updatePayload.spanish = itemData.spanish;
            }
            if (itemData.errorSummary) {
              updatePayload.errorSummary = itemData.errorSummary;
            }
            await updateDoc(itemRef, updatePayload);
          } else {
            const createPayload: Record<string, unknown> = {
              uid: user.uid,
              english: itemData.english,
              topic: itemData.topic,
              kind: itemData.kind,
              status: itemData.status,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            if (itemData.pronunciation) {
              createPayload.pronunciation = itemData.pronunciation;
            }
            if (itemData.spanish) {
              createPayload.spanish = itemData.spanish;
            }
            if (itemData.speakerRole) {
              createPayload.speakerRole = itemData.speakerRole;
            }
            if (itemData.errorSummary) {
              createPayload.errorSummary = itemData.errorSummary;
            }
            await setDoc(itemRef, createPayload);
          }
        } catch (err) {
          try {
            handleFirestoreError(
              err,
              OperationType.WRITE,
              `users/${user.uid}/savedItems/${docId}`
            );
          } catch {
            // handled
          }
        }
      }
    },
    [memory.topic, user]
  );

  const buildHistoryForApi = (msgs: ChatMessage[]) => {
    return msgs.map((m) => {
      if (m.role === 'student') {
        return { role: 'user' as const, text: m.studentText || '' };
      }
      const d = m.tutorData;
      if (!d) return { role: 'model' as const, text: '' };
      const summaryParts: string[] = [];
      if (d.spanishIntro) summaryParts.push(d.spanishIntro);
      if (d.englishPhrase) {
        summaryParts.push(`${d.speakerName || 'Tutor'}: ${d.englishPhrase}`);
      }
      if (d.translationPair) {
        summaryParts.push(
          `Traducción: ${d.translationPair.interlocutor.english} / ${d.translationPair.student.english}`
        );
      }
      return { role: 'model' as const, text: summaryParts.join('\n') };
    });
  };

  const sendMessage = useCallback(
    async (rawText: string, viaVoice = false) => {
      const trimmed = rawText.trim();
      if (!trimmed || isLoadingTurn) return;

      setTurnError(null);
      setVoiceError(null);
      setInputText('');

      const studentMsg: ChatMessage = {
        id: `msg-student-${Date.now()}`,
        role: 'student',
        timestamp: Date.now(),
        studentText: trimmed,
        viaVoice,
      };

      const msgsWithStudent = [...messages, studentMsg];
      setMessages(msgsWithStudent);
      setIsLoadingTurn(true);

      const savedSummary = savedItems
        .filter((i) => i.status !== 'dominado')
        .slice(0, 8)
        .map(
          (i) =>
            `- [${i.kind}] "${i.english}"${i.errorSummary ? ` (${i.errorSummary})` : ''}`
        );

      try {
        const res = await fetch('/api/tutor/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: trimmed,
            history: buildHistoryForApi(messages),
            memoryState: memory,
            savedSummary,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error conectando con el profesor.');
        }

        const tutorResponse = data as TutorResponse;
        const tutorMsgId = `msg-tutor-${Date.now()}`;
        const tutorMsg: ChatMessage = {
          id: tutorMsgId,
          role: 'tutor',
          timestamp: Date.now(),
          tutorData: tutorResponse,
        };

        const finalMessages = [...msgsWithStudent, tutorMsg];
        setMessages(finalMessages);

        // Compute updated memory
        const mu = tutorResponse.memoryUpdate;
        let nextMemory = memory;
        if (mu) {
          const nextErrors =
            mu.recurringErrorToAdd &&
            mu.recurringErrorToAdd.trim() &&
            !memory.recurringErrors.includes(mu.recurringErrorToAdd.trim())
              ? [...memory.recurringErrors, mu.recurringErrorToAdd.trim()].slice(-15)
              : memory.recurringErrors;

          const nextTopics =
            mu.topic &&
            mu.topic.trim() &&
            !memory.completedTopics.includes(mu.topic.trim())
              ? [...memory.completedTopics, mu.topic.trim()]
              : memory.completedTopics;

          nextMemory = {
            topic: mu.topic ?? memory.topic,
            characters: mu.characters ?? memory.characters,
            context: mu.context ?? memory.context,
            lastInterlocutorSpeaker:
              mu.lastInterlocutorSpeaker ?? memory.lastInterlocutorSpeaker,
            lastInterlocutorPhrase:
              mu.lastInterlocutorPhrase ?? memory.lastInterlocutorPhrase,
            lastStudentPhrase: mu.lastStudentPhrase ?? memory.lastStudentPhrase,
            difficultyLevel:
              (mu.difficultyLevel as DifficultyLevel) || memory.difficultyLevel,
            recurringErrors: nextErrors,
            turnCount: memory.turnCount + (mu.turnCountIncrement || 0),
            practicedPhrasesCount:
              memory.practicedPhrasesCount + (mu.practicedPhraseIncrement || 0),
            correctionsCount:
              memory.correctionsCount + (mu.correctionIncrement || 0),
            completedTopics: nextTopics,
          };
          setMemory(nextMemory);
        }

        if (
          tutorResponse.visualTradeId === 'framing' ||
          tutorResponse.visualTradeId === 'drywall' ||
          tutorResponse.visualTradeId === 'plumbing' ||
          tutorResponse.visualTradeId === 'electrical'
        ) {
          setSelectedTrade(tutorResponse.visualTradeId);
        }

        // Automatically record corrections for conversational review
        if (
          tutorResponse.turnType === 'CORRECTION' &&
          tutorResponse.englishPhrase
        ) {
          void upsertSavedItem({
            english: tutorResponse.englishPhrase,
            speakerRole: 'Frase corregida',
            errorSummary:
              mu?.recurringErrorToAdd || tutorResponse.spanishIntro || 'Corrección',
            kind: 'error',
          });
        }

        void syncStateToFirestore(nextMemory, finalMessages, handsFreeMode);

        // Automatically play English phrase audio
        if (
          tutorResponse.englishPhrase &&
          tutorResponse.turnType !== 'TOPIC_SELECTION' &&
          tutorResponse.turnType !== 'TRANSLATION'
        ) {
          const speed: AudioSpeed =
            tutorResponse.audioAction === 'play_slow' ? 'slow' : 'normal';
          const trackKey = `${tutorMsgId}::${speed}`;
          void playAudio(
            tutorResponse.englishPhrase,
            speed,
            trackKey,
            tutorResponse.speakerName,
            true
          );
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo obtener respuesta del profesor.';
        setTurnError(msg);
      } finally {
        setIsLoadingTurn(false);
      }
    },
    [
      handsFreeMode,
      isLoadingTurn,
      memory,
      messages,
      playAudio,
      savedItems,
      syncStateToFirestore,
      upsertSavedItem,
    ]
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(inputText);
  };

  const handleQuickCommand = (cmd: string) => {
    if (cmd === 'Repítela') {
      const activePhrase =
        memory.lastStudentPhrase || memory.lastInterlocutorPhrase;
      if (activePhrase) {
        const lastTutorMsg = [...messages]
          .reverse()
          .find((m) => m.role === 'tutor' && m.tutorData?.englishPhrase);
        const trackId = lastTutorMsg?.id || 'active';
        const speaker =
          lastTutorMsg?.tutorData?.speakerName || memory.lastInterlocutorSpeaker;
        void playAudio(activePhrase, 'normal', `${trackId}::normal`, speaker);
        return;
      }
    }
    if (cmd === 'Más despacio') {
      const activePhrase =
        memory.lastStudentPhrase || memory.lastInterlocutorPhrase;
      if (activePhrase) {
        const lastTutorMsg = [...messages]
          .reverse()
          .find((m) => m.role === 'tutor' && m.tutorData?.englishPhrase);
        const trackId = lastTutorMsg?.id || 'active';
        const speaker =
          lastTutorMsg?.tutorData?.speakerName || memory.lastInterlocutorSpeaker;
        void playAudio(activePhrase, 'slow', `${trackId}::slow`, speaker);
        return;
      }
    }
    void sendMessage(cmd);
  };

  const handleToggleRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    await startVoiceRecording((transcribed) => {
      void sendMessage(transcribed, true);
    });
  };

  const handleSelectTopBarTab = (tab: DeckTab) => {
    setActiveTab(tab);
    setMobilePanelOpen(tab !== 'contexto');
  };

  const handleChangeTopic = () => {
    setMobilePanelOpen(false);
    if (memory.topic) {
      void sendMessage('Cambiar de tema');
    } else {
      setActiveTab('temas');
      setMobilePanelOpen(true);
    }
  };

  const handleChangeLevel = (level: DifficultyLevel) => {
    const nextMemory = { ...memory, difficultyLevel: level };
    setMemory(nextMemory);
    void syncStateToFirestore(nextMemory, messages, handsFreeMode);
  };

  const handleToggleHandsFree = () => {
    const next = !handsFreeMode;
    setHandsFreeMode(next);
    void syncStateToFirestore(memory, messages, next);
  };

  const handleUpdateSavedStatus = async (
    id: string,
    status: SavedItem['status']
  ) => {
    setSavedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid, 'savedItems', id), {
          status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        try {
          handleFirestoreError(
            err,
            OperationType.UPDATE,
            `users/${user.uid}/savedItems/${id}`
          );
        } catch {
          // handled
        }
      }
    }
  };

  const handleDeleteSavedItem = async (id: string) => {
    setSavedItems((prev) => prev.filter((item) => item.id !== id));
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'savedItems', id));
      } catch (err) {
        try {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `users/${user.uid}/savedItems/${id}`
          );
        } catch {
          // handled
        }
      }
    }
  };

  const handleResetSession = () => {
    stopAudio();
    const freshGreeting = [createInitialGreeting()];
    setMemory(INITIAL_MEMORY);
    setMessages(freshGreeting);
    setTurnError(null);
    setVoiceError(null);
    setActiveTab('contexto');
    if (user) {
      void syncStateToFirestore(INITIAL_MEMORY, freshGreeting, handsFreeMode);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleSignIn = async () => {
    setFirestoreError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setTurnError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google.'
      );
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutAccount();
    } catch {
      // ignore
    }
  };

  return (
    <div id="top" className="min-h-screen lg:h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTopBarTab}
        onChangeTopic={handleChangeTopic}
        hasActiveTopic={Boolean(memory.topic)}
      />

      {/* Mobile Drawer Switcher */}
      <div className="lg:hidden border-b border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-2">
        <div className="text-xs text-slate-600 truncate">
          {memory.topic ? (
            <>
              <span className="font-semibold text-slate-900">{memory.topic}</span>
              <span aria-hidden="true"> · </span>
              <span>{memory.difficultyLevel}</span>
            </>
          ) : (
            <span>Elige un tema para comenzar</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMobilePanelOpen((v) => !v)}
          className="px-3 py-1.5 text-xs font-semibold text-[#0F2942] bg-slate-100 rounded-md whitespace-nowrap shrink-0"
        >
          {mobilePanelOpen ? 'Ver conversación' : 'Panel de estudio'}
        </button>
      </div>

      {/* Main 2-Zone Studio Layout */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-6 lg:overflow-hidden">
        {/* Left Zone: Interactive Conversation Stage */}
        <section
          aria-label="Conversación en inglés"
          className={`flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden lg:h-full ${
            mobilePanelOpen ? 'hidden lg:flex' : 'flex min-h-[75vh]'
          }`}
        >
          {/* Context Metadata & Workspace Toolbar */}
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                {memory.topic || 'Selección de tema'}
              </span>
              {memory.characters && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{memory.characters}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>Nivel {memory.difficultyLevel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                Turno {memory.turnCount}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleToggleHandsFree}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  handsFreeMode
                    ? 'bg-[#0F2942] text-white border-[#0F2942]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>{handsFreeMode ? 'Manos libres activo' : 'Manos libres'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  setLiveModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F2942] bg-[#EFF4F8] border border-slate-200 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap shrink-0"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Conversar en vivo</span>
              </button>
            </div>
          </div>

          {firestoreError && (
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>No se pudo sincronizar con la nube en este momento.</span>
              <button
                type="button"
                onClick={() => setFirestoreError(null)}
                className="underline font-semibold"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Scrollable Conversation Timeline */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4 bg-[#F8FAFC]/50">
            {messages.map((msg) => (
              <MessageBlock
                key={msg.id}
                message={msg}
                audioState={audioState}
                savedEnglishSet={savedEnglishSet}
                onPlayAudio={(p, s, k, sp) => void playAudio(p, s, k, sp)}
                onStopAudio={stopAudio}
                onQuickSend={(txt) => void sendMessage(txt)}
                onSavePhrase={(payload) =>
                  void upsertSavedItem({ ...payload, kind: 'phrase' })
                }
                onOpenVisualTrade={(tradeId) => {
                  setSelectedTrade(tradeId);
                  setActiveTab('visual');
                  setMobilePanelOpen(true);
                }}
              />
            ))}

            {isLoadingTurn && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-2.5 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0F2942]" />
                  <span>El profesor está preparando su respuesta...</span>
                </div>
              </div>
            )}

            {turnError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
                <span>{turnError}</span>
                <button
                  type="button"
                  onClick={() => setTurnError(null)}
                  className="text-xs font-semibold underline shrink-0"
                >
                  Cerrar
                </button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Quick Commands Bar + Input Composer */}
          <div className="border-t border-slate-200 bg-white p-3 sm:p-4 space-y-3">
            {memory.topic && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {QUICK_COMMANDS.map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    disabled={isLoadingTurn}
                    onClick={() => handleQuickCommand(cmd)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-[#EFF4F8] hover:text-[#0F2942] hover:border-[#0F2942]/30 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            )}

            {voiceError && (
              <p className="text-xs text-red-700 px-1">{voiceError}</p>
            )}

            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <button
                type="button"
                disabled={isLoadingTurn || isTranscribing}
                onClick={handleToggleRecording}
                title={isRecording ? 'Detener grabación' : 'Responder hablando por micrófono'}
                aria-label={isRecording ? 'Detener grabación' : 'Grabar respuesta por voz'}
                className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
                  isRecording
                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                } disabled:opacity-50`}
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {isTranscribing
                    ? 'Transcribiendo...'
                    : isRecording
                      ? 'Detener'
                      : 'Hablar'}
                </span>
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isLoadingTurn || isTranscribing}
                placeholder={
                  memory.topic
                    ? 'Escribe tu respuesta en inglés o un comando (ej. Mi frase, Traducción)...'
                    : 'Escribe el tema que quieres practicar (ej. Construcción, Restaurantes)...'
                }
                className="flex-1 min-w-0 px-4 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942] min-h-[44px]"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isLoadingTurn || isTranscribing}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-[#0F2942] rounded-lg hover:bg-[#173B5E] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </form>
          </div>
        </section>

        {/* Right Zone: Control & Context Deck */}
        <div
          className={`lg:h-full lg:overflow-hidden flex flex-col ${
            mobilePanelOpen ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <ControlDeck
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            memory={memory}
            user={user}
            authLoading={authLoading}
            syncLabel={syncLabel}
            handsFreeMode={handsFreeMode}
            onToggleHandsFree={handleToggleHandsFree}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            onChangeLevel={handleChangeLevel}
            onSendCommand={(cmd) => {
              setMobilePanelOpen(false);
              void sendMessage(cmd);
            }}
            onResetSession={handleResetSession}
            savedItems={savedItems}
            onUpdateSavedStatus={(id, st) => void handleUpdateSavedStatus(id, st)}
            onDeleteSavedItem={(id) => void handleDeleteSavedItem(id)}
            onPlayAudio={(p, s, k, sp) => void playAudio(p, s, k, sp)}
            selectedTrade={selectedTrade}
            onSelectTrade={setSelectedTrade}
          />
        </div>
      </main>

      <LiveVoiceModal
        isOpen={liveModalOpen}
        memory={memory}
        onClose={() => setLiveModalOpen(false)}
      />
    </div>
  );
}
