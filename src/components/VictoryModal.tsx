import React from 'react';
import { Sparkles, Trophy, ArrowRight, BookOpen, RotateCcw } from 'lucide-react';
import { TeaRecipe, CupSkin, LevelConfig } from '../types/tea';

interface VictoryModalProps {
  isOpen: boolean;
  level: number;
  moves: number;
  unlockedRecipe?: TeaRecipe;
  unlockedSkin?: CupSkin;
  nextLevelConfig: LevelConfig;
  onNextLevel: () => void;
  onReplayLevel: () => void;
  onOpenBook: () => void;
}

export function VictoryModal({
  isOpen,
  level,
  moves,
  unlockedRecipe,
  unlockedSkin,
  nextLevelConfig,
  onNextLevel,
  onReplayLevel,
  onOpenBook,
}: VictoryModalProps) {
  if (!isOpen) return null;

  return (
    <div
      id="victory-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
    >
      <div
        id="victory-modal-container"
        className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-[#251A14] border border-[#593E2F] rounded-3xl p-5 sm:p-7 shadow-2xl text-[#F3EAD8] text-center space-y-4 sm:space-y-5 animate-scale-up"
      >
        {/* Glowing Tea Ceremony Trophy */}
        <div className="relative mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#E8985E] to-[#B35F2B] p-0.5 shadow-xl shadow-[#E8985E]/20">
          <div className="w-full h-full rounded-[22px] bg-[#221711] flex items-center justify-center text-[#E8985E]">
            <Trophy className="w-10 h-10 animate-pulse" />
          </div>
          <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-[#FFD700] animate-bounce" />
        </div>

        {/* Level & Moves */}
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-widest text-[#C2AA94] font-bold">
            Идеальная сортировка
          </span>
          <h2 className="text-2xl font-bold font-['Comfortaa'] text-[#FBF6EE]">
            Купаж уровня {level} собран!
          </h2>
          <p className="text-xs text-[#A8917D]">
            Каждый слой нашел свой гармоничный сосуд за {moves} ходов.
          </p>
        </div>

        {/* Unlocked Reward Banner */}
        {unlockedRecipe && (
          <div className="bg-[#2F2119] border border-[#E8985E]/40 rounded-2xl p-4 text-left space-y-2 relative overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#E8985E]/20 text-[#E8985E]">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-[#E8985E] uppercase tracking-wider">
                Новый рецепт открыт!
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl shrink-0 border border-white/20"
                style={{ backgroundColor: unlockedRecipe.colorHex }}
              />
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[#F7EFE3] truncate">
                  {unlockedRecipe.title}
                </h4>
                <p className="text-[11px] text-[#C2AA94] truncate">
                  {unlockedRecipe.subtitle}
                </p>
              </div>
            </div>
          </div>
        )}

        {unlockedSkin && (
          <div className="bg-[#2F2119] border border-[#D4AF37]/50 rounded-2xl p-3.5 text-left flex items-center gap-3">
            <span className="p-2 rounded-xl bg-[#D4AF37]/20 text-[#FFD700]">
              <Sparkles className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-[#FFD700] uppercase tracking-wider block">
                Новый сервиз разблокирован!
              </span>
              <span className="text-xs font-bold text-[#F7EFE3] block truncate">
                {unlockedSkin.name}
              </span>
            </div>
          </div>
        )}

        {/* Next Phase Preview (Breath Rhythm) */}
        <div className="bg-[#1C130E] border border-[#38271C] rounded-2xl p-3.5 text-left space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#A8917D]">Следующая фаза:</span>
            <span className="font-bold text-[#E8985E]">
              {nextLevelConfig.phaseName}
            </span>
          </div>
          <p className="text-xs text-[#E2D2C2]">
            {nextLevelConfig.phaseSubtitle}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            id="next-level-button"
            onClick={onNextLevel}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-[#E8985E] hover:bg-[#d8874d] active:scale-[0.98] text-[#1A120D] font-bold text-sm shadow-xl shadow-[#E8985E]/20 transition-all cursor-pointer"
          >
            <span>Следующий купаж</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              id="replay-level-button"
              onClick={onReplayLevel}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#32231B] hover:bg-[#422F24] text-[#C2AA94] hover:text-[#F3EAD8] text-xs font-semibold transition-colors border border-[#4A3427]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сыграть снова</span>
            </button>

            <button
              id="view-recipe-book-button"
              onClick={onOpenBook}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#32231B] hover:bg-[#422F24] text-[#E8985E] text-xs font-semibold transition-colors border border-[#4A3427]"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Книга рецептов</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
