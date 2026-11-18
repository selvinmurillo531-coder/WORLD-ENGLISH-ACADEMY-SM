import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  GoogleGenAI,
  Type,
  ThinkingLevel,
  Modality,
  type LiveServerMessage,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const aiBeta = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1beta',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('high demand');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function formatApiError(error: unknown, fallback: string): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    return {
      status: 503,
      message:
        'El servicio de inteligencia artificial está experimentando alta demanda temporal. Intenta de nuevo en unos segundos.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Se alcanzó temporalmente el límite de solicitudes. Espera un momento antes de intentar nuevamente.',
    };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message:
        'Verifica la clave de API de Gemini en el panel de Settings > Secrets.',
    };
  }
  return { status: 500, message: raw || fallback };
}

const WORLD_ENGLISH_SYSTEM_INSTRUCTION = `
Eres el Agente Maestro de WORLD ENGLISH ACADEMY SM, un profesor profesional de inglés estadounidense especializado en enseñar a personas hispanohablantes mediante conversaciones reales, prácticas e interactivas.

TU IDENTIDAD:
- Profesor humano, paciente, natural, organizado y motivador.
- Enseñas inglés estadounidense natural mediante situaciones reales cotidianas y laborales.
- NUNCA inventas evaluaciones numéricas de pronunciación ni actúas como un curso de listas estáticas.

REGLA DE INICIO OBLIGATORIO:
- Si no hay tema activo (topic vacío) o el estudiante pide "Cambiar de tema", tu respuesta debe ser exclusivamente en español (turnType: "TOPIC_SELECTION").
- Debes preguntar exactamente: "¿Qué tema quieres aprender y practicar en inglés?"
- Ofrece ejemplos claros en suggestedTopics:
  ["Construcción y carpintería", "Instalación de drywall o sheetrock", "Plomería", "Electricidad", "Restaurantes", "Medicina", "Viajes", "Negocios", "Tecnología", "Conversaciones cotidianas"]
- No selecciones el tema por el estudiante. Espera su respuesta.

CREACIÓN DE LA SITUACIÓN:
- Cuando el estudiante elija un tema (o pida repasar errores o frases guardadas), crea una situación realista, define personajes apropiados (ej. Supervisor y Trabajador), define el contexto en memoryUpdate.context, mantén los mismos personajes y adapta el vocabulario al nivel actual (difficultyLevel).
- No solicites información innecesaria; inicia inmediatamente con el PRIMER TURNO en inglés.
- Si el tema está relacionado con carpintería/framing/planos/medidas asigna visualTradeId: "framing"; si es drywall/sheetrock/joint compound asigna "drywall"; si es plomería asigna "plumbing"; si es electricidad asigna "electrical". En otros temas omite visualTradeId.

MÉTODO PRINCIPAL DE ENSEÑANZA (ESTRICTO — 3 TURNOS):
1. PRIMER TURNO — FRASE DEL INTERLOCUTOR (turnType: "INTERLOCUTOR_TURN"):
   - Presenta ÚNICAMENTE la frase en inglés de la otra persona en englishPhrase y su rol en speakerName (ej. "Supervisor").
   - spanishIntro debe quedar vacío "".
   - NO muestres traducción ni pronunciación escrita.
   - Guarda esa frase en memoryUpdate.lastInterlocutorPhrase y el rol en memoryUpdate.lastInterlocutorSpeaker.
   - Espera la participación del estudiante.

2. SEGUNDO TURNO — RESPUESTA DEL ESTUDIANTE (turnType: "STUDENT_PHRASE"):
   - Se activa cuando el estudiante escribe: "Mi frase", "Mi turno", "¿Qué respondo?", "Dame mi respuesta" o similar.
   - Presenta ÚNICAMENTE la respuesta en inglés que debe practicar el estudiante en englishPhrase, con speakerName: "Mi respuesta".
   - spanishIntro debe quedar vacío "".
   - NO muestres traducción ni pronunciación escrita.
   - Guarda esa respuesta en memoryUpdate.lastStudentPhrase.
   - Espera al estudiante.

3. TERCER TURNO — TRADUCCIÓN (turnType: "TRANSLATION"):
   - Se activa cuando el estudiante escribe "Traducción" (o solicita la traducción).
   - Devuelve translationPair con AMBAS intervenciones anteriores:
     * interlocutor: { speaker: (ej. "SUPERVISOR" usando memoryUpdate.lastInterlocutorSpeaker), english: lastInterlocutorPhrase, pronunciation: ..., spanish: ... }
     * student: { speaker: "MI RESPUESTA", english: (lastStudentPhrase o si aún no la pidió, la respuesta natural esperada), pronunciation: ..., spanish: ... }
   - REGLAS DE PRONUNCIACIÓN ESCRITA (SOLO AQUÍ):
     * Usa letras españolas que representen fielmente el inglés estadounidense (ej. "Working" -> "Wérkin", "Measuring" -> "Méshuring", "I'm" -> "Aim").
     * NUNCA uses símbolos fonéticos IPA.
     * Respeta contracciones naturales del inglés estadounidense.
   - No omitas ninguna de las dos frases.
   - No avances automáticamente a la siguiente conversación. Deja englishPhrase vacío "".

RECONOCIMIENTO Y CORRECCIÓN (CUANDO EL ESTUDIANTE RESPONDE EN INGLÉS):
- Si la respuesta del estudiante es correcta y natural (incluyendo expresiones alternativas válidas aunque no sean idénticas a lastStudentPhrase):
  * turnType: "PRAISE_AND_NEXT"
  * spanishIntro: breve felicitación natural en español (ej. "¡Excelente! Muy natural. Seguimos:").
  * englishPhrase: LA SIGUIENTE frase única del interlocutor en inglés estadounidense para continuar la conversación.
  * speakerName: el mismo interlocutor.
  * Actualiza lastInterlocutorPhrase con la nueva frase y limpia lastStudentPhrase ("").
- Si la respuesta tiene errores gramaticales, de vocabulario o de sentido:
  * turnType: "CORRECTION"
  * spanishIntro: explica brevemente y con amabilidad el error en español.
  * englishPhrase: presenta la frase corregida en inglés (solo inglés).
  * speakerName: "Frase corregida".
  * Actualiza lastStudentPhrase con la frase corregida y agrega un resumen corto del error en recurringErrorToAdd.
  * NO avances a la siguiente frase de la conversación; permite que el estudiante vuelva a practicar.

COMANDOS ESPECIALES:
- "Mi frase" / "Mi turno" / "¿Qué respondo?" / "Dame mi respuesta" -> turnType: "STUDENT_PHRASE".
- "Traducción" -> turnType: "TRANSLATION".
- "Repítela" -> turnType: "REPEAT_OR_SLOW", audioAction: "play_normal", repite la frase activa (lastStudentPhrase si ya se mostró, sino lastInterlocutorPhrase) en englishPhrase, spanishIntro breve en español.
- "Más despacio" -> turnType: "REPEAT_OR_SLOW", audioAction: "play_slow", misma frase activa en englishPhrase, spanishIntro breve en español.
- "Dame esa palabra sola" -> turnType: "SINGLE_WORD", coloca ÚNICAMENTE esa palabra en englishPhrase, speakerName: "Palabra clave", y explica brevemente su significado y uso en spanishIntro (en español).
- "Divídela" -> turnType: "DIVIDED_PHRASE", divide la frase activa en 2 a 4 segmentos naturales dentro de segments: [{ english: "...", noteSpanish: "..." }], spanishIntro: "Aquí tienes la frase dividida por partes para practicarla:".
- "Quiero practicar otra vez" -> turnType: "REPEAT_OR_SLOW", audioAction: "play_normal", repite la frase activa sin avanzar.
- "Explícame" -> turnType: "EXPLANATION", explica en español en spanishIntro el significado, estructura o vocabulario técnico de la frase activa; incluye englishPhrase como referencia audible.
- "Otra conversación" -> crea una situación nueva dentro del tema actual (memoryState.topic) y devuelve turnType: "INTERLOCUTOR_TURN" con la primera frase del nuevo interlocutor.
- "Cambiar de tema" -> turnType: "TOPIC_SELECTION", limpia tema/personajes/contexto y pregunta en español qué tema desea practicar.
- "Repasar mis errores" o "Practicar frase: ..." -> inicia inmediatamente una nueva situación práctica (turnType: "INTERLOCUTOR_TURN") donde el estudiante deba utilizar la frase o corregir el punto señalado de forma natural.

ESPECIALIZACIÓN EN CONSTRUCCIÓN Y CARPINTERÍA:
- Usa terminología real de obra estadounidense (studs, framing, drywall/sheetrock, joint compound/mud, tape measure, circular saw, level, plumb, square, 16 inches on center, PPE, blueprints, rough-in, breaker panel, P-trap, GFCI outlet, etc.).
- No traduzcas literalmente expresiones técnicas al español cuando exista un término técnico natural en español.

PROGRESIÓN DE NIVEL:
- Principiante: frases cortas, vocabulario básico y directo.
- Intermedio: frases más completas, expresiones laborales naturales.
- Avanzado: modismos estadounidenses, vocabulario técnico detallado y diálogo fluido.

REGLAS ABSOLUTAS:
- Instrucciones y explicaciones SIEMPRE en español.
- englishPhrase y translationPair.*.english SIEMPRE en inglés estadounidense puro.
- UNA SOLA frase en inglés por turno (excepto translationPair o segments).
- NUNCA adelantes respuestas ni traducciones ni pronunciación escrita antes de tiempo.
`;

const tutorResponseSchema = {
  type: Type.OBJECT,
  properties: {
    turnType: {
      type: Type.STRING,
      description:
        'Must be one of: TOPIC_SELECTION, INTERLOCUTOR_TURN, STUDENT_PHRASE, TRANSLATION, CORRECTION, PRAISE_AND_NEXT, EXPLANATION, SINGLE_WORD, DIVIDED_PHRASE, REPEAT_OR_SLOW',
    },
    spanishIntro: {
      type: Type.STRING,
      description:
        'Spanish text for instructions, topic greeting, correction explanation, or praise. Empty string during pure INTERLOCUTOR_TURN or STUDENT_PHRASE.',
    },
    speakerName: {
      type: Type.STRING,
      description: 'Speaker label such as Supervisor, Cliente, Mi respuesta, Frase corregida, Palabra clave.',
    },
    englishPhrase: {
      type: Type.STRING,
      description: 'Pure American English phrase or word ONLY (never include Spanish here). Empty for TOPIC_SELECTION or TRANSLATION.',
    },
    visualTradeId: {
      type: Type.STRING,
      description: 'Optional visual reference ID for construction trades: framing, drywall, plumbing, or electrical.',
    },
    translationPair: {
      type: Type.OBJECT,
      description: 'Required ONLY when turnType is TRANSLATION.',
      properties: {
        interlocutor: {
          type: Type.OBJECT,
          properties: {
            speaker: { type: Type.STRING },
            english: { type: Type.STRING },
            pronunciation: { type: Type.STRING },
            spanish: { type: Type.STRING },
          },
          required: ['speaker', 'english', 'pronunciation', 'spanish'],
        },
        student: {
          type: Type.OBJECT,
          properties: {
            speaker: { type: Type.STRING },
            english: { type: Type.STRING },
            pronunciation: { type: Type.STRING },
            spanish: { type: Type.STRING },
          },
          required: ['speaker', 'english', 'pronunciation', 'spanish'],
        },
      },
      required: ['interlocutor', 'student'],
    },
    segments: {
      type: Type.ARRAY,
      description: 'Required ONLY when turnType is DIVIDED_PHRASE.',
      items: {
        type: Type.OBJECT,
        properties: {
          english: { type: Type.STRING },
          noteSpanish: { type: Type.STRING },
        },
        required: ['english'],
      },
    },
    suggestedTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    audioAction: {
      type: Type.STRING,
      description: 'play_normal, play_slow, or none',
    },
    memoryUpdate: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING },
        characters: { type: Type.STRING },
        context: { type: Type.STRING },
        lastInterlocutorSpeaker: { type: Type.STRING },
        lastInterlocutorPhrase: { type: Type.STRING },
        lastStudentPhrase: { type: Type.STRING },
        difficultyLevel: { type: Type.STRING },
        recurringErrorToAdd: { type: Type.STRING },
        turnCountIncrement: { type: Type.INTEGER },
        practicedPhraseIncrement: { type: Type.INTEGER },
        correctionIncrement: { type: Type.INTEGER },
      },
      required: [
        'topic',
        'characters',
        'context',
        'lastInterlocutorSpeaker',
        'lastInterlocutorPhrase',
        'lastStudentPhrase',
        'difficultyLevel',
        'turnCountIncrement',
        'practicedPhraseIncrement',
        'correctionIncrement',
      ],
    },
  },
  required: ['turnType', 'memoryUpdate'],
};

function selectMaleVoiceForSpeaker(speakerName?: string): 'Charon' | 'Fenrir' | 'Puck' {
  const s = (speakerName || '').toLowerCase();
  if (
    s.includes('supervisor') ||
    s.includes('foreman') ||
    s.includes('contratista') ||
    s.includes('inspector') ||
    s.includes('doctor') ||
    s.includes('gerente') ||
    s.includes('entrevistador')
  ) {
    return 'Fenrir';
  }
  if (
    s.includes('cliente') ||
    s.includes('mesero') ||
    s.includes('compañero') ||
    s.includes('vendedor') ||
    s.includes('recepcionista') ||
    s.includes('agente')
  ) {
    return 'Puck';
  }
  return 'Charon';
}

// In-memory cache for generated TTS WAV clips
const ttsCache = new Map<string, string>();
const MAX_TTS_CACHE = 180;

function setTtsCache(key: string, base64Wav: string) {
  if (ttsCache.size >= MAX_TTS_CACHE) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey) ttsCache.delete(firstKey);
  }
  ttsCache.set(key, base64Wav);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/tutor/turn', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'Falta configurar GEMINI_API_KEY en el panel de Secrets.',
        });
      }

      const { userMessage, history, memoryState, savedSummary } = req.body as {
        userMessage: string;
        history: Array<{ role: 'user' | 'model'; text: string }>;
        memoryState: Record<string, unknown>;
        savedSummary?: string[];
      };

      const formattedHistory = (history || []).slice(-16).map((item) => ({
        role: item.role,
        parts: [{ text: item.text }],
      }));

      const savedContext =
        savedSummary && savedSummary.length > 0
          ? `\nFRASES GUARDADAS Y ERRORES PENDIENTES DEL ESTUDIANTE:\n${savedSummary.slice(0, 8).join('\n')}\n`
          : '';

      const stateContext = `
ESTADO ACTUAL DE MEMORIA DEL ESTUDIANTE:
${JSON.stringify(memoryState, null, 2)}
${savedContext}
MENSAJE DEL ESTUDIANTE:
"${userMessage}"

Responde estrictamente en JSON respetando el schema y todas las reglas de WORLD ENGLISH ACADEMY SM.
`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            ...formattedHistory,
            { role: 'user', parts: [{ text: stateContext }] },
          ],
          config: {
            systemInstruction: WORLD_ENGLISH_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: tutorResponseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (error: unknown) {
      console.error('Error in /api/tutor/turn:', error);
      const { status, message } = formatApiError(
        error,
        'Error generando respuesta del profesor.'
      );
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'Falta configurar GEMINI_API_KEY en el panel de Secrets.',
        });
      }

      const {
        text,
        speed = 'normal',
        level = 'Principiante',
        speakerName = '',
      } = req.body as {
        text?: string;
        speed?: 'normal' | 'slow';
        level?: string;
        speakerName?: string;
      };

      const cleanText = (text || '').trim();
      if (!cleanText) {
        return res.status(400).json({ error: 'Se requiere una frase en inglés.' });
      }

      const voiceName = selectMaleVoiceForSpeaker(speakerName);
      const cacheKey = `${cleanText}::${speed}::${level}::${voiceName}`;
      const cached = ttsCache.get(cacheKey);
      if (cached) {
        return res.json({
          audioBase64: cached,
          mimeType: 'audio/wav',
          voiceName,
          cached: true,
        });
      }

      let stylePrompt =
        'Warm, clear male American English teacher, natural conversational intonation, crisp articulation.';
      if (speed === 'slow') {
        stylePrompt =
          'Male American English speaker speaking noticeably slowly, deliberately, and very clearly word-by-word so a Spanish-speaking learner can hear every sound distinctly.';
      } else if (level === 'Principiante') {
        stylePrompt =
          'Patient male American English speaker speaking at a slightly measured, gentle beginner pace with clear enunciation and natural warmth.';
      } else if (level === 'Intermedio') {
        stylePrompt =
          'Natural male American English speaker at a comfortable everyday workplace pace with clear intonation.';
      } else {
        stylePrompt =
          'Confident, natural male American English speaker at authentic native conversational speed with expressive intonation.';
      }

      const response = await withRetry(() =>
        aiBeta.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText,
                  speechMetadata: {
                    style: stylePrompt,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        })
      );

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        return res.status(502).json({
          error: 'No se pudo generar el audio de la frase.',
        });
      }

      setTtsCache(cacheKey, base64Audio);
      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName,
        cached: false,
      });
    } catch (error: unknown) {
      console.error('Error in /api/tts:', error);
      const { status, message } = formatApiError(error, 'Error generando audio.');
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'Falta configurar GEMINI_API_KEY en el panel de Secrets.',
        });
      }

      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };

      if (!audioBase64) {
        return res.status(400).json({ error: 'No se recibió audio para transcribir.' });
      }

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe exactly what the speaker said. The speaker may be speaking English (practicing conversation) or Spanish (giving a tutor command). Output only the exact spoken words without extra commentary.',
              },
            ],
          },
        })
      );

      const text = (response.text ?? '').trim();
      res.json({ text });
    } catch (error: unknown) {
      console.error('Error in /api/transcribe:', error);
      const { status, message } = formatApiError(
        error,
        'Error al transcribir el audio.'
      );
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/live' });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    if (!process.env.GEMINI_API_KEY) {
      clientWs.send(
        JSON.stringify({
          error: 'Falta configurar GEMINI_API_KEY en el servidor.',
        })
      );
      clientWs.close();
      return;
    }

    const reqUrl = new URL(req.url || '/api/live', `http://${req.headers.host || 'localhost'}`);
    const topic = reqUrl.searchParams.get('topic') || 'Conversación cotidiana';
    const characters = reqUrl.searchParams.get('characters') || 'Supervisor y Trabajador';
    const context = reqUrl.searchParams.get('context') || 'Práctica conversacional en tiempo real';
    const level = reqUrl.searchParams.get('level') || 'Principiante';
    const speaker = reqUrl.searchParams.get('speaker') || '';
    const voiceName = selectMaleVoiceForSpeaker(speaker);

    const liveSystemInstruction = `
Eres el Agente Maestro de WORLD ENGLISH ACADEMY SM en modo de conversación de voz en tiempo real.
Escenario actual:
- Tema: ${topic}
- Personajes: ${characters}
- Contexto: ${context}
- Nivel del estudiante: ${level}

REGLAS ESTRICTAS DE VOZ EN VIVO:
1. Mantén el personaje y habla en inglés estadounidense natural, una sola frase corta por turno, y espera la respuesta del estudiante.
2. Si el nivel es Principiante, habla despacio y claro con frases cortas.
3. No traduzcas al español ni adelantes respuestas a menos que el estudiante pida explícitamente "Traducción", "Mi frase", "Explícame" o "Más despacio".
4. Si el estudiante comete un error al responder en inglés, corrígelo brevemente en español sin desmotivar, di la frase corregida en inglés y pídele repetirla.
5. Nunca inventes puntuaciones ni evaluaciones numéricas de pronunciación.
6. Comienza saludando brevemente en personaje con la primera frase corta en inglés para iniciar la conversación.
`;

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

    try {
      liveSession = await aiBeta.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: liveSystemInstruction,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({ error: 'Error de conexión con voz en tiempo real.' })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true, voiceName }));
        liveSession.sendRealtimeInput({
          text: 'Start the conversation now in character with one short American English opening phrase.',
        });
      }
    } catch (err: unknown) {
      console.error('Failed to connect Gemini Live session:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error:
              err instanceof Error
                ? err.message
                : 'No se pudo iniciar la sesión de voz en vivo.',
          })
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
        };
        if (msg.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text) {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch {
        // ignore malformed packet
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // already closed
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`WORLD ENGLISH ACADEMY SM running on http://localhost:${PORT}`);
  });
}

startServer();
