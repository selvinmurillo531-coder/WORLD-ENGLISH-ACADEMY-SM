import React from 'react';
import { Volume2, RotateCcw, Gauge, Square } from 'lucide-react';
import type { AudioSpeed } from '../types';

export interface ActiveAudioState {
  playingKey: string | null;
  loadingKey: string | null;
  errorKey: string | null;
  errorMessage: string | null;
}

interface AudioControlsProps {
  phrase: string;
  phraseId: string;
  speakerName?: string;
  audioState: ActiveAudioState;
  onPlay: (
    phrase: string,
    speed: AudioSpeed,
    trackKey: string,
    speakerName?: string
  ) => void;
  onStop: () => void;
  compact?: boolean;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  phrase,
  phraseId,
  speakerName,
  audioState,
  onPlay,
  onStop,
  compact = false,
}) => {
  const normalKey = `${phraseId}::normal`;
  const slowKey = `${phraseId}::slow`;

  const isPlayingNormal = audioState.playingKey === normalKey;
  const isPlayingSlow = audioState.playingKey === slowKey;
  const isPlayingThis = isPlayingNormal || isPlayingSlow;

  const isLoadingNormal = audioState.loadingKey === normalKey;
  const isLoadingSlow = audioState.loadingKey === slowKey;
  const isLoadingThis = isLoadingNormal || isLoadingSlow;

  const hasError =
    audioState.errorKey === normalKey || audioState.errorKey === slowKey;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isPlayingThis ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg hover:bg-[#173B5E] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Detener audio</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isLoadingThis}
            onClick={() => onPlay(phrase, 'normal', normalKey, speakerName)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg hover:bg-[#173B5E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Volume2 className="w-4 h-4" />
            <span>{isLoadingNormal ? 'Generando...' : 'Escuchar'}</span>
          </button>
        )}

        <button
          type="button"
          disabled={isLoadingThis}
          onClick={() =>
            onPlay(
              phrase,
              isPlayingSlow ? 'slow' : 'normal',
              isPlayingSlow ? slowKey : normalKey,
              speakerName
            )
          }
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200/70 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Repetir</span>
        </button>

        <button
          type="button"
          disabled={isLoadingThis}
          onClick={() => onPlay(phrase, 'slow', slowKey, speakerName)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
            isPlayingSlow
              ? 'bg-sky-50 text-sky-900 border-sky-300 font-semibold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          } disabled:opacity-60`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>{isLoadingSlow ? 'Cargando...' : 'Más despacio'}</span>
        </button>

        {!compact && (
          <button
            type="button"
            disabled={isLoadingThis}
            onClick={() => onPlay(phrase, 'normal', normalKey, speakerName)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
              isPlayingNormal
                ? 'bg-sky-50 text-sky-900 border-sky-300 font-semibold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            } disabled:opacity-60`}
          >
            <span>Velocidad normal</span>
          </button>
        )}
      </div>

      {isPlayingThis && (
        <p className="text-xs font-medium text-[#0F2942]">
          {isPlayingSlow
            ? 'Reproduciendo pronunciación lenta en inglés estadounidense...'
            : 'Reproduciendo en inglés estadounidense...'}
        </p>
      )}

      {hasError && audioState.errorMessage && (
        <div className="flex items-center gap-2 text-xs text-red-700">
          <span>{audioState.errorMessage}</span>
          <button
            type="button"
            onClick={() => onPlay(phrase, 'normal', normalKey, speakerName)}
            className="underline font-medium hover:text-red-900"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
};
