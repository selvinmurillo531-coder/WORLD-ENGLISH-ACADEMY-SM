import React, { useState } from 'react';
import { Volume2, Gauge, MessageSquare, Hammer } from 'lucide-react';
import type { AudioSpeed, TradeVisualId } from '../types';

interface VisualTradePanelProps {
  selectedTrade: TradeVisualId;
  onSelectTrade: (id: TradeVisualId) => void;
  onPlayAudio: (phrase: string, speed: AudioSpeed, trackKey: string, speakerName?: string) => void;
  onPracticeTerm: (termEnglish: string, tradeLabel: string) => void;
}

interface TradeTerm {
  english: string;
  spanish: string;
}

interface TradeConfig {
  id: TradeVisualId;
  label: string;
  imageSrc: string;
  caption: string;
  terms: TradeTerm[];
}

const TRADE_DATA: Record<TradeVisualId, TradeConfig> = {
  framing: {
    id: 'framing',
    label: 'Carpintería y Framing',
    imageSrc: '/src/assets/images/trade_wood_framing_1794973699266.jpg',
    caption: 'Estructura de pared en madera estadounidense (16 inches on center).',
    terms: [
      { english: 'Stud', spanish: 'Poste / Parante vertical' },
      { english: 'Double top plate', spanish: 'Solera superior doble' },
      { english: 'Bottom sill plate', spanish: 'Solera inferior' },
      { english: 'Window header', spanish: 'Dintel o cabezal de ventana' },
      { english: 'Sixteen inches on center', spanish: 'Dieciséis pulgadas a centro' },
      { english: 'Tape measure', spanish: 'Cinta métrica / Metro' },
    ],
  },
  drywall: {
    id: 'drywall',
    label: 'Drywall y Sheetrock',
    imageSrc: '/src/assets/images/trade_drywall_finishing_1794973698699.jpg',
    caption: 'Herramientas y materiales para instalación y acabado de sheetrock.',
    terms: [
      { english: 'Sheetrock panel', spanish: 'Placa de yeso / Drywall' },
      { english: 'Metal corner bead', spanish: 'Esquinero metálico' },
      { english: 'Joint tape', spanish: 'Cinta para juntas' },
      { english: 'Mud pan', spanish: 'Charola para pasta' },
      { english: 'Taping knife', spanish: 'Espátula ancha para drywall' },
      { english: 'Sanding sponge', spanish: 'Esponja abrasiva para lijado' },
    ],
  },
  plumbing: {
    id: 'plumbing',
    label: 'Plomería',
    imageSrc: '/src/assets/images/trade_plumbing_roughin_1794973699546.jpg',
    caption: 'Instalación de desagüe y alimentación de agua bajo lavabo.',
    terms: [
      { english: 'P-trap', spanish: 'Trampa en P / Sifón' },
      { english: 'Shutoff valve', spanish: 'Válvula de cierre / Llave de paso' },
      { english: 'Braided supply line', spanish: 'Manguera trenzada de suministro' },
      { english: 'Copper pipe', spanish: 'Tubería de cobre' },
      { english: 'Teflon tape', spanish: 'Cinta de teflón' },
      { english: 'Pipe wrench', spanish: 'Llave Stilson / Llave para tubo' },
    ],
  },
  electrical: {
    id: 'electrical',
    label: 'Electricidad',
    imageSrc: '/src/assets/images/trade_electrical_panel_1794973700304.jpg',
    caption: 'Tablero de breakers, contacto GFCI y cableado residencial.',
    terms: [
      { english: 'Breaker panel', spanish: 'Tablero de pastillas / Breakers' },
      { english: 'GFCI outlet', spanish: 'Contacto con protección a tierra' },
      { english: 'Romex cable', spanish: 'Cable eléctrico residencial NM-B' },
      { english: 'Wire strippers', spanish: 'Pinzas pelacables' },
      { english: 'Voltage tester', spanish: 'Probador de voltaje sin contacto' },
    ],
  },
};

export const VisualTradePanel: React.FC<VisualTradePanelProps> = ({
  selectedTrade,
  onSelectTrade,
  onPlayAudio,
  onPracticeTerm,
}) => {
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const current = TRADE_DATA[selectedTrade];
  const tradeList = Object.values(TRADE_DATA);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600 leading-relaxed">
        Apoyo visual contextual para oficios en EE. UU. Escucha cada término o llévalo directo a una conversación práctica:
      </p>

      {/* Trade Selector */}
      <div className="grid grid-cols-2 gap-1.5">
        {tradeList.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTrade(item.id)}
            className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
              selectedTrade === item.id
                ? 'bg-[#0F2942] text-white border-[#0F2942]'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Technical Illustration */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
        {!imgFailed[current.id] ? (
          <img
            src={current.imageSrc}
            alt={current.caption}
            referrerPolicy="no-referrer"
            onError={() =>
              setImgFailed((prev) => ({ ...prev, [current.id]: true }))
            }
            className="w-full aspect-[4/3] object-cover"
          />
        ) : (
          <div className="w-full aspect-[4/3] flex flex-col items-center justify-center p-4 text-center text-slate-500 gap-2">
            <Hammer className="w-8 h-8 text-slate-400" />
            <span className="text-xs font-medium">{current.label}</span>
          </div>
        )}
        <div className="px-3 py-2 bg-white border-t border-slate-200 text-xs text-slate-600">
          {current.caption}
        </div>
      </div>

      {/* Interactive Terms */}
      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
        {current.terms.map((term) => {
          const trackBase = `visual-${current.id}-${term.english}`;
          return (
            <div key={term.english} className="p-3 bg-white space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {term.english}
                </span>
                <span className="text-xs text-slate-500 text-right">
                  {term.spanish}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onPlayAudio(term.english, 'normal', `${trackBase}::normal`, 'Profesor')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0F2942] rounded-md hover:bg-[#173B5E]"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Escuchar</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPlayAudio(term.english, 'slow', `${trackBase}::slow`, 'Profesor')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200/70"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>Despacio</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPracticeTerm(term.english, current.label)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0F2942] bg-[#EFF4F8] border border-slate-200 rounded-md hover:bg-slate-200/60"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Practicar</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
