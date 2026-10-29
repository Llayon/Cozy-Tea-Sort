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
          short: 'Старт',
          bg: 'bg-[#84B866]/15 border-[#84B866]/35 text-[#B2DC9A]',
        };
      case 'challenge':
        return {
          icon: <Wind className="w-3.5 h-3.5 text-[#FFA834]" />,
          text: 'Легкий вызов',
          short: 'Вызов',
          bg: 'bg-[#FFA834]/15 border-[#FFA834]/35 text-[#FFC77A]',
        };
      case 'peak':
        return {
          icon: <Flame className="w-3.5 h-3.5 text-[#D6405C]" />,
          text: 'Пик • Тайна',
          short: 'Пик',
          bg: 'bg-[#D6405C]/15 border-[#D6405C]/35 text-[#F391A4]',
        };
      case 'relax':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-[#F2C94C]" />,
          text: 'Релакс-награда',
          short: 'Релакс',
          bg: 'bg-[#F2C94C]/15 border-[#F2C94C]/35 text-[#FFE48A]',
        };
    }
  };

  const style = getBadgeStyle();

  return (
    <button
      onClick={onClick}
      aria-label={`Фаза: ${style.text}. Открыть описание ритма`}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer max-[479px]:min-w-[36px] max-[479px]:min-h-[36px] max-[479px]:justify-center max-[479px]:gap-0.5 max-[479px]:px-1.5 ${style.bg}`}
      title="Ритм «Дыхание» — нажмите для описания"
    >
      {style.icon}
      <span className="hidden min-[480px]:inline">{style.text}</span>
      <span className="min-[480px]:hidden max-[379px]:sr-only">{style.short}</span>
    </button>
  );
}
