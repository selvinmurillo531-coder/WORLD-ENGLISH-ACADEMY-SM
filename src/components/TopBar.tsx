import React from 'react';
import type { DeckTab } from '../types';

interface TopBarProps {
  activeTab: DeckTab;
  onSelectTab: (tab: DeckTab) => void;
  onChangeTopic: () => void;
  hasActiveTopic: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onChangeTopic,
  hasActiveTopic,
}) => {
  const navItems: Array<{ id: DeckTab; label: string }> = [
    { id: 'contexto', label: 'Conversación' },
    { id: 'repaso', label: 'Repaso' },
    { id: 'visual', label: 'Oficios' },
    { id: 'progreso', label: 'Progreso' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('contexto');
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          WORLD ENGLISH ACADEMY SM
        </a>

        {/* Zone 2: 4 single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-[#0F2942] border-[#0F2942] font-semibold'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onChangeTopic}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F2942] rounded-lg hover:bg-[#173B5E] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2942]"
          >
            {hasActiveTopic ? 'Cambiar de tema' : 'Elegir tema'}
          </button>
        </div>
      </div>
    </header>
  );
};
