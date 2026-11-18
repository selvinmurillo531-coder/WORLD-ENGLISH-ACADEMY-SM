import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Loader2, Volume2 } from 'lucide-react';
import type { MemoryState } from '../types';

interface LiveVoiceModalProps {
  isOpen: boolean;
  memory: MemoryState;
  onClose: () => void;
}

interface LiveTranscriptItem {
  id: string;
  role: 'student' | 'tutor';
  text: string;
}

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const numSamples = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  memory,
  onClose,
}) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>(
    'connecting'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<LiveTranscriptItem[]>([]);

  const isMutedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setStatus('connecting');
    setErrorMessage(null);
    setTranscripts([]);
    setIsMuted(false);
    setIsModelSpeaking(false);

    const stopAllPlayback = () => {
      activeSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch {
          // already stopped
        }
      });
      activeSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setIsModelSpeaking(false);
    };

    const startSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;
        nextStartTimeRef.current = 0;

        const params = new URLSearchParams({
          topic: memory.topic || 'Conversaciones cotidianas',
          characters: memory.characters || 'Supervisor y Trabajador',
          context: memory.context || 'Práctica conversacional en vivo',
          level: memory.difficultyLevel,
          speaker: memory.lastInterlocutorSpeaker || 'Supervisor',
        });

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/live?${params.toString()}`);
        wsRef.current = ws;

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (ev) => {
          if (
            isMutedRef.current ||
            !wsRef.current ||
            wsRef.current.readyState !== WebSocket.OPEN
          ) {
            return;
          }
          const float32 = ev.inputBuffer.getChannelData(0);
          const base64 = floatTo16BitPcmBase64(float32);
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const msg = JSON.parse(event.data) as {
              ready?: boolean;
              error?: string;
              audio?: string;
              inputTranscript?: string;
              outputTranscript?: string;
              interrupted?: boolean;
              turnComplete?: boolean;
            };

            if (msg.ready) {
              setStatus('connected');
            }
            if (msg.error) {
              setStatus('error');
              setErrorMessage(msg.error);
            }
            if (msg.interrupted) {
              stopAllPlayback();
            }
            if (msg.inputTranscript) {
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'student') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: `${last.text} ${msg.inputTranscript}`.trim() },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `live-in-${Date.now()}`,
                    role: 'student',
                    text: msg.inputTranscript || '',
                  },
                ];
              });
            }
            if (msg.outputTranscript) {
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'tutor') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: `${last.text}${msg.outputTranscript}` },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `live-out-${Date.now()}`,
                    role: 'tutor',
                    text: msg.outputTranscript || '',
                  },
                ];
              });
            }
            if (msg.audio && outputCtxRef.current) {
              const ctx = outputCtxRef.current;
              const samples = base64PcmToFloat32(msg.audio);
              const audioBuffer = ctx.createBuffer(1, samples.length, 24000);
              audioBuffer.copyToChannel(new Float32Array(samples), 0);

              const bufSource = ctx.createBufferSource();
              bufSource.buffer = audioBuffer;
              bufSource.connect(ctx.destination);

              const now = ctx.currentTime;
              const startAt = Math.max(now, nextStartTimeRef.current);
              bufSource.start(startAt);
              nextStartTimeRef.current = startAt + audioBuffer.duration;
              setIsModelSpeaking(true);

              activeSourcesRef.current.add(bufSource);
              bufSource.onended = () => {
                activeSourcesRef.current.delete(bufSource);
                if (activeSourcesRef.current.size === 0) {
                  setIsModelSpeaking(false);
                }
              };
            }
          } catch {
            // ignore malformed message
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setStatus('error');
            setErrorMessage('Se perdió la conexión de voz en tiempo real.');
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            stopAllPlayback();
          }
        };
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            'No se pudo activar el micrófono. Verifica los permisos del navegador.'
          );
        }
      }
    };

    void startSession();

    return () => {
      cancelled = true;
      stopAllPlayback();
      processorRef.current?.disconnect();
      processorRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
        void inputCtxRef.current.close();
      }
      if (outputCtxRef.current && outputCtxRef.current.state !== 'closed') {
        void outputCtxRef.current.close();
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [isOpen, memory.characters, memory.context, memory.difficultyLevel, memory.lastInterlocutorSpeaker, memory.topic]);

  if (!isOpen) return null;

  const sendVoiceCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text: cmd }));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversación por voz en tiempo real"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Conversación por voz en tiempo real
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {memory.topic || 'Conversaciones cotidianas'} · Nivel {memory.difficultyLevel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Finalizar llamada</span>
          </button>
        </div>

        {/* Live Status */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            {status === 'connecting' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#0F2942]" />
                <span>Conectando sesión de voz con el profesor...</span>
              </>
            )}
            {status === 'connected' && (
              <>
                <Volume2 className="w-4 h-4 text-[#0F2942]" />
                <span>
                  {isModelSpeaking
                    ? 'El interlocutor está hablando...'
                    : isMuted
                      ? 'Micrófono silenciado'
                      : 'Escuchando — habla en inglés o di un comando'}
                </span>
              </>
            )}
            {status === 'error' && (
              <span className="text-red-700">
                {errorMessage || 'Error en la conexión de voz.'}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={status !== 'connected'}
            onClick={() => setIsMuted((m) => !m)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              isMuted
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            } disabled:opacity-50`}
          >
            {isMuted ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>Silenciado</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Micrófono activo</span>
              </>
            )}
          </button>
        </div>

        {/* Transcript Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#F8FAFC] min-h-[220px]">
          {transcripts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8 leading-relaxed">
              Escucha la frase de inicio del interlocutor y responde hablando en inglés estadounidense. Puedes pedir en voz alta: «Mi frase», «Traducción», «Más despacio» o «Explícame».
            </p>
          ) : (
            transcripts.map((item) => (
              <div
                key={item.id}
                className={`flex ${item.role === 'student' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed border ${
                    item.role === 'student'
                      ? 'bg-[#EFF4F8] border-slate-200 text-slate-900'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">
                    {item.role === 'student' ? 'Tú' : memory.lastInterlocutorSpeaker || 'Profesor'}
                  </div>
                  <p>{item.text}</p>
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Quick Voice Command Helpers */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center gap-2 overflow-x-auto">
          {['Mi frase', 'Traducción', 'Más despacio', 'Explícame'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={status !== 'connected'}
              onClick={() => sendVoiceCommand(cmd)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-[#EFF4F8] hover:text-[#0F2942] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
