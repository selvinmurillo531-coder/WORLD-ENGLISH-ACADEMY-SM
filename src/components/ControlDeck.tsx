import React, { useState } from 'react';
import {
  User as UserIcon,
  Hammer,
  Terminal,
  BarChart3,
  RotateCcw,
  ChevronRight,
  Bookmark,
  Volume2,
  Gauge,
  MessageSquare,
  Trash2,
  LogIn,
  LogOut,
  CheckCircle2,
  Headphones,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  AudioSpeed,
  DeckTab,
  DifficultyLevel,
  MemoryState,
  SavedItem,
  TradeVisualId,
} from '../types';
import { VisualTradePanel } from './VisualTradePanel';

interface ControlDeckProps {
  activeTab: DeckTab;
  onSelectTab: (tab: DeckTab) => void;
  memory: MemoryState;
  user: User | null;
  authLoading: boolean;
  syncLabel: string;
  handsFreeMode: boolean;
  onToggleHandsFree: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onChangeLevel: (level: DifficultyLevel) => void;
  onSendCommand: (command: string) => void;
  onResetSession: () => void;
  savedItems: SavedItem[];
  onUpdateSavedStatus: (id: string, status: SavedItem['status']) => void;
  onDeleteSavedItem: (id: string) => void;
  onPlayAudio: (
    phrase: string,
    speed: AudioSpeed,
    trackKey: string,
    speakerName?: string
  ) => void;
  selectedTrade: TradeVisualId;
  onSelectTrade: (id: TradeVisualId) => void;
}

const CONSTRUCTION_TOPICS = [
  'Construcción y carpintería (framing de madera)',
  'Instalación de drywall y sheetrock',
  'Aplicación de joint compound y acabados',
  'Plomería residencial y comercial',
  'Instalaciones eléctricas y tableros',
  'Lectura de planos y medidas en pulgadas',
  'Compra de materiales y seguridad en obra',
];

const GENERAL_TOPICS = [
  'Restaurantes y gastronomía',
  'Medicina y atención médica',
  'Viajes y aeropuertos',
  'Negocios y ventas',
  'Tecnología',
  'Atención al cliente',
  'Entrevistas laborales',
  'Conversaciones familiares y sociales',
];

const SPECIAL_COMMANDS: Array<{ cmd: string; desc: string }> = [
  { cmd: 'Mi frase', desc: 'Muestra la respuesta en inglés que debes practicar.' },
  { cmd: 'Traducción', desc: 'Muestra inglés, pronunciación aproximada y español.' },
  { cmd: 'Repítela', desc: 'Vuelve a reproducir la frase activa en inglés.' },
  { cmd: 'Más despacio', desc: 'Reproduce la frase activa a menor velocidad.' },
  { cmd: 'Dame esa palabra sola', desc: 'Aísla una palabra clave con su propio audio.' },
  { cmd: 'Divídela', desc: 'Separa la frase en segmentos cortos para practicar.' },
  { cmd: 'Quiero practicar otra vez', desc: 'Repite el ejercicio actual sin avanzar.' },
  { cmd: 'Explícame', desc: 'Explica en español la estructura o el vocabulario.' },
  { cmd: 'Otra conversación', desc: 'Crea una situación nueva dentro del mismo tema.' },
  { cmd: 'Cambiar de tema', desc: 'Vuelve al menú para elegir un tema distinto.' },
];

export const ControlDeck: React.FC<ControlDeckProps> = ({
  activeTab,
  onSelectTab,
  memory,
  user,
  authLoading,
  syncLabel,
  handsFreeMode,
  onToggleHandsFree,
  onSignIn,
  onSignOut,
  onChangeLevel,
  onSendCommand,
  onResetSession,
  savedItems,
  onUpdateSavedStatus,
  onDeleteSavedItem,
  onPlayAudio,
  selectedTrade,
  onSelectTrade,
}) => {
  const [avatarFailed, setAvatarFailed] = useState(false);

  const levels: DifficultyLevel[] = ['Principiante', 'Intermedio', 'Avanzado'];

  const tabs: Array<{ id: DeckTab; label: string; icon: React.ReactNode }> = [
    { id: 'contexto', label: 'Contexto', icon: <UserIcon className="w-3.5 h-3.5" /> },
    { id: 'temas', label: 'Temas', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'repaso', label: 'Repaso', icon: <Bookmark className="w-3.5 h-3.5" /> },
    { id: 'visual', label: 'Oficios', icon: <Hammer className="w-3.5 h-3.5" /> },
    { id: 'comandos', label: 'Comandos', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'progreso', label: 'Progreso', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
      {/* Professor Profile & Cloud Account Header */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/professor_miller_avatar_1794973083939.jpg"
                alt="Profesor Miller — WORLD ENGLISH ACADEMY SM"
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-5 h-5 text-slate-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold text-slate-900 truncate">
              Prof. Miller
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
              <span>Voces masculinas US</span>
              <span aria-hidden="true">·</span>
              <span>{memory.difficultyLevel}</span>
            </div>
          </div>
        </div>

        {/* Cloud Sync / Google Auth Strip */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          {user ? (
            <>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate">
                  {user.displayName || user.email}
                </div>
                <div className="text-[11px] text-emerald-700 font-medium">
                  {syncLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200/70 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </>
          ) : (
            <>
              <div className="text-[11px] text-slate-500 leading-tight">
                {syncLabel}
              </div>
              <button
                type="button"
                disabled={authLoading}
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F2942] bg-[#EFF4F8] border border-slate-200 rounded-md hover:bg-slate-200/70 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Guardar en la nube</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Interactive Tab Switcher */}
      <div className="p-2 border-b border-slate-200 bg-slate-50">
        <div className="grid grid-cols-3 gap-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-[#0F2942] border border-slate-200 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 overflow-y-auto flex-1 space-y-5">
        {activeTab === 'contexto' && (
          <>
            {/* Difficulty Selector */}
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">
                Nivel de aprendizaje
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {levels.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => onChangeLevel(lvl)}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      memory.difficultyLevel === lvl
                        ? 'bg-white text-[#0F2942] font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                {memory.difficultyLevel === 'Principiante' &&
                  'Frases cortas, vocabulario básico y velocidad lenta.'}
                {memory.difficultyLevel === 'Intermedio' &&
                  'Frases completas, expresiones laborales y ritmo natural.'}
                {memory.difficultyLevel === 'Avanzado' &&
                  'Expresiones estadounidenses, términos técnicos y fluidez profesional.'}
              </p>
            </div>

            {/* Hands-Free Mode Toggle */}
            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Headphones className="w-4 h-4 text-[#0F2942] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Modo manos libres
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      Reproduce cada frase y activa el micrófono automáticamente al terminar.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={handsFreeMode}
                  onClick={onToggleHandsFree}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    handsFreeMode
                      ? 'bg-[#0F2942] text-white border-[#0F2942]'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70'
                  }`}
                >
                  {handsFreeMode ? 'Activado' : 'Apagado'}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="text-xs font-semibold text-slate-500">
                Situación activa
              </div>
              {memory.topic ? (
                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Tema</dt>
                    <dd className="font-semibold text-slate-900">{memory.topic}</dd>
                  </div>
                  {memory.characters && (
                    <div>
                      <dt className="text-xs text-slate-500">Personajes</dt>
                      <dd className="text-slate-800">{memory.characters}</dd>
                    </div>
                  )}
                  {memory.context && (
                    <div>
                      <dt className="text-xs text-slate-500">Contexto</dt>
                      <dd className="text-slate-700 leading-relaxed">{memory.context}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed">
                  Aún no has elegido un tema. Selecciona uno en el chat o en{' '}
                  <button
                    type="button"
                    onClick={() => onSelectTab('temas')}
                    className="font-semibold text-[#0F2942] underline"
                  >
                    Temas
                  </button>{' '}
                  para comenzar la conversación.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'temas' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-[#0F2942] mb-2">
                Construcción y oficios en EE. UU.
              </h3>
              <div className="space-y-1.5">
                {CONSTRUCTION_TOPICS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onSendCommand(t);
                      onSelectTab('contexto');
                    }}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg hover:bg-[#EFF4F8] hover:border-[#0F2942]/30 hover:text-[#0F2942] transition-colors"
                  >
                    <span>{t}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Otras situaciones reales
              </h3>
              <div className="space-y-1.5">
                {GENERAL_TOPICS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onSendCommand(t);
                      onSelectTab('contexto');
                    }}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg hover:bg-[#EFF4F8] hover:border-[#0F2942]/30 hover:text-[#0F2942] transition-colors"
                  >
                    <span>{t}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'repaso' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-600 leading-relaxed">
                Frases guardadas y errores para practicar en conversación real con el profesor.
              </p>
              {savedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onSendCommand('Repasar mis errores');
                    onSelectTab('contexto');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2942] rounded-lg hover:bg-[#173B5E] whitespace-nowrap shrink-0"
                >
                  Repasar con IA
                </button>
              )}
            </div>

            {savedItems.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed">
                Aún no tienes frases guardadas. Usa el botón <strong>Guardar para repasar</strong> en cualquier frase del chat, o las correcciones se guardarán automáticamente aquí.
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-medium text-slate-500">
                          {item.kind === 'error' ? 'Error corregido' : 'Frase guardada'} ·{' '}
                          {item.topic || 'General'}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5">
                          {item.english}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedItem(item.id)}
                        aria-label="Eliminar frase"
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {item.errorSummary && (
                      <p className="text-xs text-amber-800">{item.errorSummary}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onPlayAudio(
                            item.english,
                            'normal',
                            `saved-${item.id}::normal`,
                            item.speakerRole
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#0F2942] rounded-md"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Escuchar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onPlayAudio(
                            item.english,
                            'slow',
                            `saved-${item.id}::slow`,
                            item.speakerRole
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md"
                      >
                        <Gauge className="w-3 h-3" />
                        <span>Despacio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSendCommand(`Practicar frase: ${item.english}`);
                          onSelectTab('contexto');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0F2942] bg-[#EFF4F8] border border-slate-200 rounded-md"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Practicar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSavedStatus(
                            item.id,
                            item.status === 'dominado' ? 'pendiente' : 'dominado'
                          )
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border ${
                          item.status === 'dominado'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          {item.status === 'dominado' ? 'Dominada' : 'Marcar dominada'}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'visual' && (
          <VisualTradePanel
            selectedTrade={selectedTrade}
            onSelectTrade={onSelectTrade}
            onPlayAudio={onPlayAudio}
            onPracticeTerm={(termEnglish, tradeLabel) => {
              onSendCommand(
                `Quiero practicar una conversación sobre ${tradeLabel} usando el término "${termEnglish}"`
              );
              onSelectTab('contexto');
            }}
          />
        )}

        {activeTab === 'comandos' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Haz clic en cualquier comando o escríbelo directamente en el chat:
            </p>
            {SPECIAL_COMMANDS.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => {
                  onSendCommand(item.cmd);
                  onSelectTab('contexto');
                }}
                className="w-full text-left p-2.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-[#EFF4F8] hover:border-[#0F2942]/30 transition-colors"
              >
                <div className="text-xs font-semibold text-[#0F2942]">
                  «{item.cmd}»
                </div>
                <div className="text-xs text-slate-600 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'progreso' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  {memory.turnCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Turnos</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  {memory.practicedPhrasesCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Frases</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  {memory.correctionsCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Correcciones</div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="text-xs font-semibold text-slate-500 mb-2">
                Puntos a reforzar
              </div>
              {memory.recurringErrors.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {memory.recurringErrors.map((err, idx) => (
                    <li
                      key={`${err}-${idx}`}
                      className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md"
                    >
                      {err}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  Aún no hay errores registrados en tu sesión actual.
                </p>
              )}
            </div>

            {memory.completedTopics.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold text-slate-500 mb-2">
                  Temas practicados
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  {memory.completedTopics.join(' · ')}
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onResetSession}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reiniciar progreso y sesión</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
