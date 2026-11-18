import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Mic,
  Bookmark,
  BookmarkCheck,
  Hammer,
} from 'lucide-react';
import type { ChatMessage, AudioSpeed, TradeVisualId } from '../types';
import { AudioControls, type ActiveAudioState } from './AudioControls';

interface MessageBlockProps {
  message: ChatMessage;
  audioState: ActiveAudioState;
  savedEnglishSet: Set<string>;
  onPlayAudio: (
    phrase: string,
    speed: AudioSpeed,
    trackKey: string,
    speakerName?: string
  ) => void;
  onStopAudio: () => void;
  onQuickSend: (text: string) => void;
  onSavePhrase: (payload: {
    english: string;
    pronunciation?: string;
    spanish?: string;
    speakerRole?: string;
  }) => void;
  onOpenVisualTrade: (tradeId: TradeVisualId) => void;
}

export const MessageBlock: React.FC<MessageBlockProps> = ({
  message,
  audioState,
  savedEnglishSet,
  onPlayAudio,
  onStopAudio,
  onQuickSend,
  onSavePhrase,
  onOpenVisualTrade,
}) => {
  if (message.role === 'student') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] bg-[#EFF4F8] border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-end gap-2 text-xs text-slate-500 mb-1">
            <span>Tú</span>
            {message.viaVoice && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Mic className="w-3 h-3" />
                  por voz
                </span>
              </>
            )}
          </div>
          <p className="text-[15px] leading-relaxed text-slate-900 font-medium">
            {message.studentText}
          </p>
        </div>
      </div>
    );
  }

  const data = message.tutorData;
  if (!data) return null;

  const renderSaveButton = (payload: {
    english: string;
    pronunciation?: string;
    spanish?: string;
    speakerRole?: string;
  }) => {
    const isSaved = savedEnglishSet.has(payload.english.trim().toLowerCase());
    return (
      <button
        type="button"
        onClick={() => onSavePhrase(payload)}
        className={`inline-flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
          isSaved
            ? 'text-emerald-700'
            : 'text-slate-500 hover:text-[#0F2942]'
        }`}
      >
        {isSaved ? (
          <>
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Guardada</span>
          </>
        ) : (
          <>
            <Bookmark className="w-3.5 h-3.5" />
            <span>Guardar para repasar</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%] sm:max-w-[88%] bg-white border border-slate-200 rounded-xl px-5 py-4">
        {/* TOPIC SELECTION */}
        {data.turnType === 'TOPIC_SELECTION' && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">
              Prof. Miller · Inicio de sesión
            </div>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-900 mb-2">
              {data.spanishIntro || '¿Qué tema quieres aprender y practicar en inglés?'}
            </h2>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Elige una de las situaciones prácticas o escribe el tema que necesites practicar hoy:
            </p>
            {data.suggestedTopics && data.suggestedTopics.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.suggestedTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => onQuickSend(topic)}
                    className="text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg hover:bg-[#EFF4F8] hover:border-[#0F2942]/30 hover:text-[#0F2942] transition-colors min-h-[42px]"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TURN 1 & TURN 2: PURE ENGLISH PHRASE ONLY */}
        {(data.turnType === 'INTERLOCUTOR_TURN' ||
          data.turnType === 'STUDENT_PHRASE') &&
          data.englishPhrase && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="text-xs font-semibold text-slate-500">
                  {data.speakerName ||
                    (data.turnType === 'STUDENT_PHRASE' ? 'Mi respuesta' : 'Interlocutor')}
                </div>
                {renderSaveButton({
                  english: data.englishPhrase,
                  speakerRole: data.speakerName,
                })}
              </div>
              <p className="text-xl sm:text-2xl font-semibold text-slate-900 leading-snug tracking-tight">
                {data.englishPhrase}
              </p>
              <AudioControls
                phrase={data.englishPhrase}
                phraseId={message.id}
                speakerName={data.speakerName}
                audioState={audioState}
                onPlay={onPlayAudio}
                onStop={onStopAudio}
              />
            </div>
          )}

        {/* TURN 3: STRUCTURED TRANSLATION */}
        {data.turnType === 'TRANSLATION' && data.translationPair && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-3">
              Traducción y guía de pronunciación
            </div>

            {/* Interlocutor */}
            <div className="pb-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs font-bold tracking-wide text-[#0F2942]">
                  {data.translationPair.interlocutor.speaker.toUpperCase()}
                </div>
                {renderSaveButton({
                  english: data.translationPair.interlocutor.english,
                  pronunciation: data.translationPair.interlocutor.pronunciation,
                  spanish: data.translationPair.interlocutor.spanish,
                  speakerRole: data.translationPair.interlocutor.speaker,
                })}
              </div>
              <dl className="space-y-1.5 text-[15px]">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1">
                  <dt className="text-xs font-semibold text-slate-500 pt-0.5">Inglés:</dt>
                  <dd className="font-semibold text-slate-900">
                    {data.translationPair.interlocutor.english}
                  </dd>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1">
                  <dt className="text-xs font-semibold text-slate-500 pt-0.5">
                    Pronunciación:
                  </dt>
                  <dd className="font-mono text-sm text-slate-700">
                    {data.translationPair.interlocutor.pronunciation}
                  </dd>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1">
                  <dt className="text-xs font-semibold text-slate-500 pt-0.5">Español:</dt>
                  <dd className="text-slate-700">
                    {data.translationPair.interlocutor.spanish}
                  </dd>
                </div>
              </dl>
              <AudioControls
                phrase={data.translationPair.interlocutor.english}
                phraseId={`${message.id}-interlocutor`}
                speakerName={data.translationPair.interlocutor.speaker}
                audioState={audioState}
                onPlay={onPlayAudio}
                onStop={onStopAudio}
              />
            </div>

            {/* Hairline divider */}
            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs font-bold tracking-wide text-[#0F2942]">
                  {data.translationPair.student.speaker.toUpperCase()}
                </div>
                {renderSaveButton({
                  english: data.translationPair.student.english,
                  pronunciation: data.translationPair.student.pronunciation,
                  spanish: data.translationPair.student.spanish,
                  speakerRole: data.translationPair.student.speaker,
                })}
              </div>
              <dl className="space-y-1.5 text-[15px]">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1">
                  <dt className="text-xs font-semibold text-slate-500 pt-0.5">Inglés:</dt>
                  <dd className="font-semibold text-slate-900">
                    {data.translationPair.student.english}
                  </dd>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1">
                  <dt className="text-xs font-semibold text-slate-500 pt-0.5">
                    Pronunciación:
                  </dt>
                  <dd className="font-mono text-sm text-slate-700">
                    {data.translationPair.student.pronunciation}
                  </dd>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1">
                  <dt className="text-xs font-semibold text-slate-500 pt-0.5">Español:</dt>
                  <dd className="text-slate-700">
                    {data.translationPair.student.spanish}
                  </dd>
                </div>
              </dl>
              <AudioControls
                phrase={data.translationPair.student.english}
                phraseId={`${message.id}-student`}
                speakerName="Mi respuesta"
                audioState={audioState}
                onPlay={onPlayAudio}
                onStop={onStopAudio}
              />
            </div>

            <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              Cuando estés listo, escribe o graba tu respuesta en inglés para continuar la conversación.
            </p>
          </div>
        )}

        {/* CORRECTION */}
        {data.turnType === 'CORRECTION' && (
          <div>
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Corrección y práctica</span>
            </div>
            {data.spanishIntro && (
              <p className="text-[15px] text-slate-700 leading-relaxed mb-4">
                {data.spanishIntro}
              </p>
            )}
            {data.englishPhrase && (
              <div className="bg-amber-50/50 border border-amber-200/80 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="text-xs font-semibold text-amber-900">
                    {data.speakerName || 'Frase corregida'}
                  </div>
                  {renderSaveButton({
                    english: data.englishPhrase,
                    speakerRole: 'Frase corregida',
                  })}
                </div>
                <p className="text-lg sm:text-xl font-semibold text-slate-900">
                  {data.englishPhrase}
                </p>
                <AudioControls
                  phrase={data.englishPhrase}
                  phraseId={message.id}
                  speakerName="Frase corregida"
                  audioState={audioState}
                  onPlay={onPlayAudio}
                  onStop={onStopAudio}
                />
              </div>
            )}
          </div>
        )}

        {/* PRAISE AND NEXT INTERLOCUTOR PHRASE */}
        {data.turnType === 'PRAISE_AND_NEXT' && (
          <div>
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm mb-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Respuesta correcta</span>
            </div>
            {data.spanishIntro && (
              <p className="text-sm text-slate-700 leading-relaxed mb-4">
                {data.spanishIntro}
              </p>
            )}
            {data.englishPhrase && (
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="text-xs font-semibold text-slate-500">
                    {data.speakerName || 'Interlocutor'}
                  </div>
                  {renderSaveButton({
                    english: data.englishPhrase,
                    speakerRole: data.speakerName,
                  })}
                </div>
                <p className="text-xl sm:text-2xl font-semibold text-slate-900 leading-snug tracking-tight">
                  {data.englishPhrase}
                </p>
                <AudioControls
                  phrase={data.englishPhrase}
                  phraseId={message.id}
                  speakerName={data.speakerName}
                  audioState={audioState}
                  onPlay={onPlayAudio}
                  onStop={onStopAudio}
                />
              </div>
            )}
          </div>
        )}

        {/* DIVIDED PHRASE */}
        {data.turnType === 'DIVIDED_PHRASE' && data.segments && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">
              Práctica por segmentos
            </div>
            {data.spanishIntro && (
              <p className="text-sm text-slate-700 mb-4">{data.spanishIntro}</p>
            )}
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {data.segments.map((seg, idx) => (
                <div key={`${message.id}-seg-${idx}`} className="p-3.5 bg-white">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base sm:text-lg font-semibold text-slate-900">
                      {idx + 1}. {seg.english}
                    </span>
                    {seg.noteSpanish && (
                      <span className="text-xs text-slate-500">{seg.noteSpanish}</span>
                    )}
                  </div>
                  <AudioControls
                    phrase={seg.english}
                    phraseId={`${message.id}-seg-${idx}`}
                    speakerName="Profesor"
                    audioState={audioState}
                    onPlay={onPlayAudio}
                    onStop={onStopAudio}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EXPLANATION / SINGLE WORD / REPEAT OR SLOW */}
        {(data.turnType === 'EXPLANATION' ||
          data.turnType === 'SINGLE_WORD' ||
          data.turnType === 'REPEAT_OR_SLOW') && (
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F2942] mb-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {data.turnType === 'SINGLE_WORD'
                  ? 'Palabra clave'
                  : data.turnType === 'EXPLANATION'
                    ? 'Explicación del profesor'
                    : 'Práctica de escucha'}
              </span>
            </div>
            {data.spanishIntro && (
              <p className="text-[15px] text-slate-700 leading-relaxed mb-3">
                {data.spanishIntro}
              </p>
            )}
            {data.englishPhrase && (
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between gap-3 mb-1">
                  {data.speakerName ? (
                    <div className="text-xs font-semibold text-slate-500">
                      {data.speakerName}
                    </div>
                  ) : (
                    <div />
                  )}
                  {renderSaveButton({
                    english: data.englishPhrase,
                    speakerRole: data.speakerName,
                  })}
                </div>
                <p className="text-xl font-semibold text-slate-900">
                  {data.englishPhrase}
                </p>
                <AudioControls
                  phrase={data.englishPhrase}
                  phraseId={message.id}
                  speakerName={data.speakerName}
                  audioState={audioState}
                  onPlay={onPlayAudio}
                  onStop={onStopAudio}
                />
              </div>
            )}
          </div>
        )}

        {/* Contextual Visual Reference Trigger for Construction & Trades */}
        {data.visualTradeId &&
          (data.visualTradeId === 'framing' ||
            data.visualTradeId === 'drywall' ||
            data.visualTradeId === 'plumbing' ||
            data.visualTradeId === 'electrical') && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Apoyo visual técnico disponible para este oficio
              </span>
              <button
                type="button"
                onClick={() => onOpenVisualTrade(data.visualTradeId!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F2942] bg-[#EFF4F8] border border-slate-200 rounded-lg hover:bg-slate-200/60 transition-colors whitespace-nowrap shrink-0"
              >
                <Hammer className="w-3.5 h-3.5" />
                <span>Ver referencia visual</span>
              </button>
            </div>
          )}
      </div>
    </div>
  );
};
