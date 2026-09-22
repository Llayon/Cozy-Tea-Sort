import React from 'react';
import { Wind, Sparkles, Flame, Coffee } from 'lucide-react';
import { LevelConfig } from '../types/tea';

interface RhythmBadgeProps {
  config: LevelConfig;
  onClick: () => void;
}

export function RhythmBadge({ config, onClick }: RhythmBadgeProps) {
  const getBadgeStyle = () => {
    switch (config.phase) {
      case 'warmup':
        return {
          icon: <Coffee className="w-3.5 h-3.5 text-[#84B866]" />,
          text: 'Разминка',
          bg: 'bg-[#84B866]/15 border-[#84B866]/35 text-[#B2DC9A]',
        };
      case 'challenge':
        return {
          icon: <Wind className="w-3.5 h-3.5 text-[#FFA834]" />,
          text: 'Легкий вызов',
          bg: 'bg-[#FFA834]/15 border-[#FFA834]/35 text-[#FFC77A]',
        };
      case 'peak':
        return {
          icon: <Flame className="w-3.5 h-3.5 text-[#D6405C]" />,
          text: 'Пик • Тайна',
          bg: 'bg-[#D6405C]/15 border-[#D6405C]/35 text-[#F391A4]',
        };
      case 'relax':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-[#F2C94C]" />,
          text: 'Релакс-награда',
          bg: 'bg-[#F2C94C]/15 border-[#F2C94C]/35 text-[#FFE48A]',
        };
    }
  };

  const style = getBadgeStyle();

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer ${style.bg}`}
      title="Ритм «Дыхание» — нажмите для описания"
    >
      {style.icon}
      <span>{style.text}</span>
    </button>
  );
}
