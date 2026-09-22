/**
 * Cozy Tea Sort / Чайный купаж - Telegram Mini App Main Component
 *
 * Архитектура:
 * - Кривая сложности «Дыхание» (Sawtooth: Разминка -> Вызов -> Пик -> Релакс)
 * - Мета-прогрессия: разблокировка рецептов в «Чайной книге» и сервизов посуды
 * - Механика «Таинственный настой» со скрытым слоем под пенкой
 * - Telegram Mini App тактильный отклик и Cozy звуковой синтезатор
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Sparkles,
  Info,
  X,
  BookOpen,
  Coffee,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  TeaSortLogic,
  TeaSortView,
  TEA_TYPES,
  TeaId,
  audioSynth,
  telegram,
} from './game/teaSortMonolith';
import { TeaRoomBackground } from './components/TeaRoomBackground';
import { getLevelConfig } from './utils/difficultyCurve';
import { TEA_RECIPES, CUP_SKINS } from './data/teaRecipes';
import { CupSkinId, TeaRecipe, CupSkin, LevelConfig } from './types/tea';
import { RecipeBookModal } from './components/RecipeBookModal';
import { VictoryModal } from './components/VictoryModal';
import { RhythmBadge } from './components/RhythmBadge';

interface LevelBackupState {
  cups: TeaId[][];
  hiddenCounts: number[];
}

export default function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TeaSortView | null>(null);
  const logicRef = useRef<TeaSortLogic | null>(null);

  const [level, setLevel] = useState<number>(() => {
    const saved = localStorage.getItem('cozy_tea_level');
    return saved ? Math.max(1, parseInt(saved, 10)) : 1;
  });
  const [moves, setMoves] = useState<number>(0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [isWon, setIsWon] = useState<boolean>(false);
  const [isDeadlocked, setIsDeadlocked] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(audioSynth.muted);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showRecipeBook, setShowRecipeBook] = useState<boolean>(false);
  const [selectedCupIndex, setSelectedCupIndex] = useState<number | null>(null);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  // Meta-Progression State
  const [unlockedRecipeIds, setUnlockedRecipeIds] = useState<TeaId[]>(() => {
    const saved = localStorage.getItem('cozy_tea_unlocked_recipes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return ['matcha'];
  });

  const [equippedSkin, setEquippedSkin] = useState<CupSkinId>(() => {
    const saved = localStorage.getItem('cozy_tea_equipped_skin') as CupSkinId;
    return saved && ['glass', 'ceramic', 'porcelain'].includes(saved) ? saved : 'glass';
  });

  // Rewards achieved on current level completion
  const [justUnlockedRecipe, setJustUnlockedRecipe] = useState<TeaRecipe | undefined>();
  const [justUnlockedSkin, setJustUnlockedSkin] = useState<CupSkin | undefined>();

  // Initial state store for Level restart
  const initialLevelStateRef = useRef<LevelBackupState>({ cups: [], hiddenCounts: [] });
  const hintTimerRef = useRef<number | null>(null);

  const currentConfig: LevelConfig = getLevelConfig(level);
  const nextConfig: LevelConfig = getLevelConfig(level + 1);

  const startLevel = (lvlNum: number) => {
    const cfg = getLevelConfig(lvlNum);

    const generated = TeaSortLogic.generateSolvableLevel(
      cfg.numColors,
      cfg.emptyCups,
      cfg.colors,
      cfg.hasMysteryLayer,
      cfg.shuffleSteps
    );

    // Deep clone for clean restart
    initialLevelStateRef.current = {
      cups: generated.cups.map((c) => [...c]),
      hiddenCounts: [...generated.hiddenCounts],
    };

    const logic = new TeaSortLogic(generated.cups, generated.hiddenCounts);
    logicRef.current = logic;

    setLevel(lvlNum);
    localStorage.setItem('cozy_tea_level', lvlNum.toString());

    setMoves(0);
    setCanUndo(false);
    setIsWon(false);
    setIsDeadlocked(false);
    setSelectedCupIndex(null);
    setJustUnlockedRecipe(undefined);
    setJustUnlockedSkin(undefined);

    if (viewRef.current) {
      viewRef.current.logic = logic;
      viewRef.current.setSkin(equippedSkin);
      viewRef.current.resetLevel();
    }
  };

  useEffect(() => {
    telegram.init();

    const container = canvasContainerRef.current;
    if (!container) return;

    const initialLvl = level;
    const cfg = getLevelConfig(initialLvl);

    const generated = TeaSortLogic.generateSolvableLevel(
      cfg.numColors,
      cfg.emptyCups,
      cfg.colors,
      cfg.hasMysteryLayer,
      cfg.shuffleSteps
    );

    initialLevelStateRef.current = {
      cups: generated.cups.map((c) => [...c]),
      hiddenCounts: [...generated.hiddenCounts],
    };

    const logic = new TeaSortLogic(generated.cups, generated.hiddenCounts);
    logicRef.current = logic;

    let isDisposed = false;

    const view = new TeaSortView(container, logic, {
      onMoveComplete: () => {
        if (isDisposed) return;
        setMoves(logic.movesCount);
        setCanUndo(logic.canUndo);
      },
      onWin: () => {
        if (isDisposed) return;

        // Check meta-progression rewards
        const currentCfg = getLevelConfig(logicRef.current ? level : initialLvl);
        let newlyUnlockedRecipe: TeaRecipe | undefined;
        let newlyUnlockedSkin: CupSkin | undefined;

        if (currentCfg.rewardRecipeId) {
          const recipe = TEA_RECIPES.find((r) => r.id === currentCfg.rewardRecipeId);
          if (recipe) {
            setUnlockedRecipeIds((prev) => {
              if (!prev.includes(recipe.id)) {
                const next = [...prev, recipe.id];
                localStorage.setItem('cozy_tea_unlocked_recipes', JSON.stringify(next));
                return next;
              }
              return prev;
            });
            newlyUnlockedRecipe = recipe;
          }
        }

        if (currentCfg.rewardSkinId) {
          const skin = CUP_SKINS.find((s) => s.id === currentCfg.rewardSkinId);
          if (skin) {
            newlyUnlockedSkin = skin;
          }
        }

        setJustUnlockedRecipe(newlyUnlockedRecipe);
        setJustUnlockedSkin(newlyUnlockedSkin);
        setIsWon(true);
        setIsDeadlocked(false);
        setCanUndo(false);
      },
      onDeadlock: () => {
        if (isDisposed) return;
        setIsDeadlocked(true);
      },
      onSelectCup: (idx) => {
        if (isDisposed) return;
        setSelectedCupIndex(idx);
        if (idx !== null) {
          setHintMessage(null);
        }
      },
      onInvalidMove: (reason) => {
        if (isDisposed) return;
        setHintMessage(reason);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = window.setTimeout(() => {
          setHintMessage(null);
        }, 3500);
      },
    });

    view.init().then(() => {
      if (isDisposed) {
        view.destroy();
        return;
      }
      viewRef.current = view;
      view.setSkin(equippedSkin);
      view.layoutCups();
      view.renderAllCups();
    }).catch((err) => {
      console.error('Failed to init TeaSortView:', err);
    });

    return () => {
      isDisposed = true;
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  const handleUndo = () => {
    if (!viewRef.current || !logicRef.current || !canUndo) return;
    viewRef.current.undoMove();
    setMoves(logicRef.current.movesCount);
    setCanUndo(logicRef.current.canUndo);
    setIsDeadlocked(false);
  };

  const handleRestart = () => {
    if (!viewRef.current || !logicRef.current) return;
    const backup = initialLevelStateRef.current;
    const restoredCups = backup.cups.map((c) => [...c]);
    const restoredHidden = [...backup.hiddenCounts];

    logicRef.current.initFromState(restoredCups, restoredHidden);
    viewRef.current.logic = logicRef.current;
    viewRef.current.setSkin(equippedSkin);
    viewRef.current.resetLevel();

    setMoves(0);
    setCanUndo(false);
    setIsWon(false);
    setIsDeadlocked(false);
    setSelectedCupIndex(null);
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  const handleNextLevel = () => {
    startLevel(level + 1);
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  const toggleSound = () => {
    const muted = audioSynth.toggleMute();
    setIsMuted(muted);
    telegram.hapticSelection();
  };

  const handleSelectSkin = (skinId: CupSkinId) => {
    setEquippedSkin(skinId);
    localStorage.setItem('cozy_tea_equipped_skin', skinId);
    if (viewRef.current) {
      viewRef.current.setSkin(skinId);
    }
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  const selectedTea =
    selectedCupIndex !== null && logicRef.current?.cups[selectedCupIndex]
      ? logicRef.current.cups[selectedCupIndex].topLayer
        ? TEA_TYPES[logicRef.current.cups[selectedCupIndex].topLayer!]
        : null
      : null;

  return (
    <div
      id="cozy-tea-app"
      className="relative w-full h-screen h-[100dvh] flex flex-col bg-[#1A1412] text-[#F5EDE0] overflow-hidden select-none font-sans"
    >
      {/* Top Header */}
      <header
        id="app-header"
        className="shrink-0 flex items-center justify-between px-2.5 sm:px-4 py-2 sm:py-2.5 pt-[max(8px,env(safe-area-inset-top))] bg-[#241A16]/95 border-b border-[#3D2C24] backdrop-blur-md z-20 gap-1.5"
      >
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#35251F] border border-[#523A2F] flex items-center justify-center text-[#E8985E] shadow-inner shrink-0">
            <Coffee className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs sm:text-sm font-semibold tracking-wide text-[#F8EFE4] leading-tight">
                Чайный купаж
              </h1>
              <span className="text-[10px] sm:text-[11px] text-[#A68F80]">#{level}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-[#A68F80]">
              <span>Ходов: {moves}</span>
            </div>
          </div>
        </div>

        {/* Center: Sawtooth Rhythm Indicator */}
        <div className="flex items-center shrink-0">
          <RhythmBadge
            config={currentConfig}
            onClick={() => {
              setShowRecipeBook(true);
              audioSynth.playSelect();
              telegram.hapticSelection();
            }}
          />
        </div>

        {/* Right action icons with >=44px mobile touch ergonomics */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Recipe Book / Shelf */}
          <button
            id="recipe-book-btn"
            onClick={() => {
              setShowRecipeBook(true);
              audioSynth.playSelect();
              telegram.hapticSelection();
            }}
            aria-label="Книга рецептов и чайный сервиз"
            className="relative min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] w-10 h-10 rounded-xl bg-[#30211B] border border-[#48342B] flex items-center justify-center text-[#E8985E] hover:bg-[#3D2B23] active:scale-95 transition-all"
            title="Чайная книга и сервиз"
          >
            <BookOpen className="w-4 h-4" />
            {unlockedRecipeIds.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E8985E] text-[#1A120D] text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                {unlockedRecipeIds.length}
              </span>
            )}
          </button>

          <button
            id="sound-toggle-btn"
            onClick={toggleSound}
            aria-label="Включить/выключить звук"
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] w-10 h-10 rounded-xl bg-[#30211B] border border-[#48342B] flex items-center justify-center text-[#D8C2B2] hover:bg-[#3D2B23] active:scale-95 transition-all"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-[#A89082]" /> : <Volume2 className="w-4 h-4 text-[#E8B878]" />}
          </button>

          <button
            id="info-toggle-btn"
            onClick={() => {
              setShowInfo(true);
              audioSynth.playSelect();
              telegram.hapticSelection();
            }}
            aria-label="Правила и купажи"
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] w-10 h-10 rounded-xl bg-[#30211B] border border-[#48342B] flex items-center justify-center text-[#D8C2B2] hover:bg-[#3D2B23] active:scale-95 transition-all"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Selected Cup Floating Info Banner */}
      <div
        id="selected-tea-banner"
        className={`shrink-0 px-3 sm:px-4 py-1.5 bg-[#201612]/95 border-b border-[#36251E] flex items-center justify-between text-xs transition-all duration-200 z-10 ${
          selectedTea ? 'opacity-100 max-h-12' : 'opacity-0 max-h-0 py-0 border-transparent overflow-hidden'
        }`}
      >
        {selectedTea && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30 shrink-0"
                style={{ backgroundColor: selectedTea.colorHex }}
              />
              <span className="font-medium text-[#F2E4D4] shrink-0">{selectedTea.nameRu}:</span>
              <span className="text-[#B39D8D] text-[11px] truncate max-w-[120px] sm:max-w-[220px]">{selectedTea.description}</span>
            </div>
            <span className="text-[10px] text-[#F4A460] bg-[#2E201B] px-2 py-0.5 rounded border border-[#5A3F33] font-medium shrink-0 ml-1">
              Куда перелить?
            </span>
          </>
        )}
      </div>

      {/* Mystery Layer Notice Banner */}
      {currentConfig.hasMysteryLayer && !selectedTea && !hintMessage && (
        <div
          id="mystery-layer-hint"
          className="shrink-0 px-3 py-1 bg-[#2B1B15]/90 border-b border-[#472D22] flex items-center justify-center gap-1.5 text-[10.5px] sm:text-[11px] text-[#D4AF87] z-10 text-center"
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#E8985E] shrink-0" />
          <span>Таинственный настой: нижний слой скрыт под пенкой до раскрытия</span>
        </div>
      )}

      {/* Invalid Move Hint Toast */}
      {hintMessage && !isDeadlocked && !isWon && (
        <div
          id="invalid-move-hint"
          className="absolute top-24 left-4 right-4 bg-[#381B16]/95 border border-[#853D2C] rounded-xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 z-30 pointer-events-none"
        >
          <AlertCircle className="w-5 h-5 text-[#F4A460] shrink-0" />
          <div className="text-xs text-[#FFE8DF] leading-snug font-medium">{hintMessage}</div>
        </div>
      )}

      {/* Pixi Canvas Workspace */}
      <main
        id="canvas-stage"
        ref={canvasContainerRef}
        className="relative flex-1 w-full h-full overflow-hidden touch-none bg-[#241710]"
      >
        {/* Декоративный интерьер чайной комнаты */}
        <TeaRoomBackground />
      </main>

      {/* Deadlock Banner Toast */}
      {isDeadlocked && !isWon && (
        <div
          id="deadlock-warning"
          className="absolute bottom-20 left-4 right-4 bg-[#3B191D]/95 border border-[#80313E] rounded-xl p-3 shadow-xl backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 z-30"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-[#F47587] shrink-0" />
            <div>
              <div className="text-xs font-semibold text-[#FFD6DC]">Ходов больше нет!</div>
              <div className="text-[11px] text-[#E0AAB2]">Отмените последний ход или начните заново</div>
            </div>
          </div>
          <button
            id="deadlock-undo-btn"
            onClick={handleUndo}
            className="px-3 py-1.5 rounded-lg bg-[#682430] hover:bg-[#7D2C3B] active:scale-95 text-xs font-medium text-[#FFF0F2] border border-[#963748] transition-all shrink-0"
          >
            Отменить
          </button>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <footer
        id="app-footer"
        className="shrink-0 bg-[#241A16]/95 border-t border-[#3D2C24] px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-between gap-2 sm:gap-3 z-20"
      >
        <button
          id="undo-btn"
          onClick={handleUndo}
          disabled={!canUndo}
          className={`min-h-[44px] flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl border text-xs font-medium transition-all ${
            canUndo
              ? 'bg-[#33231D] hover:bg-[#402D25] border-[#553C31] text-[#F2E5D6] active:scale-[0.98]'
              : 'bg-[#221815] border-[#33241F] text-[#695449] cursor-not-allowed opacity-60'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Отмена</span>
        </button>

        <button
          id="restart-btn"
          onClick={handleRestart}
          className="min-h-[44px] flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl bg-[#33231D] hover:bg-[#402D25] border border-[#553C31] text-[#F2E5D6] text-xs font-medium active:scale-[0.98] transition-all"
        >
          <RotateCw className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Сброс</span>
        </button>

        <button
          id="new-level-btn"
          onClick={handleNextLevel}
          className="min-h-[44px] flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl bg-[#523A25] hover:bg-[#63462E] border border-[#7D5A3C] text-[#FFE8CD] text-xs font-medium shadow-sm active:scale-[0.98] transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#F4A460] shrink-0" />
          <span className="truncate">Новый купаж</span>
        </button>
      </footer>

      {/* Victory Modal with Meta-Progression & Next Rhythm Phase */}
      <VictoryModal
        isOpen={isWon}
        level={level}
        moves={moves}
        unlockedRecipe={justUnlockedRecipe}
        unlockedSkin={justUnlockedSkin}
        nextLevelConfig={nextConfig}
        onNextLevel={handleNextLevel}
        onReplayLevel={handleRestart}
        onOpenBook={() => {
          setIsWon(false);
          setShowRecipeBook(true);
        }}
      />

      {/* Recipe Book & Service Modal */}
      <RecipeBookModal
        isOpen={showRecipeBook}
        onClose={() => setShowRecipeBook(false)}
        unlockedRecipeIds={unlockedRecipeIds}
        currentLevel={level}
        activeSkinId={equippedSkin}
        onSelectSkin={handleSelectSkin}
      />

      {/* Info / Tea Menu Drawer */}
      {showInfo && (
        <div
          id="tea-menu-modal"
          className="fixed inset-0 bg-[#0F0A09]/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-in fade-in duration-200"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="w-full max-w-sm bg-[#241A16] border border-[#4D3528] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#3D2C23] mb-3">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-[#F4A460]" />
                <h3 className="text-sm font-bold text-[#FDF5E8]">Чайная карта и правила</h3>
              </div>
              <button
                id="close-info-btn"
                onClick={() => setShowInfo(false)}
                className="w-7 h-7 rounded-lg bg-[#30211B] flex items-center justify-center text-[#B39D8D] hover:text-[#FFF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rules */}
            <div className="text-xs text-[#D8C4B5] mb-4 space-y-1.5 bg-[#1C1410] p-3 rounded-xl border border-[#38271F]">
              <div className="font-semibold text-[#F4A460] mb-1">Как играть:</div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#87A96B] font-bold">1.</span>
                <span>Тапните на стакан с напитком, чтобы поднять его.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#87A96B] font-bold">2.</span>
                <span>
                  Тапните на целевой стакан: напиток перельется, если цвет верхнего слоя совпадает или стакан пустой.
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#87A96B] font-bold">3.</span>
                <span>За один ход переливаются все смежные слои одинакового чая.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#87A96B] font-bold">4.</span>
                <span>Цель — собрать в каждом стакане напиток одного чистого купажа.</span>
              </div>
              <div className="flex items-start gap-1.5 pt-1 text-[#E8985E]">
                <span className="font-bold">✨</span>
                <span>Без таймеров и штрафов: медитируйте и отменяйте ходы в любой момент.</span>
              </div>
            </div>

            {/* Tea Palette */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#A68F80] uppercase tracking-wider">
                Сорта чая в купаже:
              </div>
              {Object.values(TEA_TYPES).map((tea) => (
                <div
                  key={tea.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-[#1C1410] border border-[#35241C]"
                >
                  <div
                    className="w-7 h-7 rounded-lg shadow-inner shrink-0 ring-1 ring-white/20"
                    style={{ backgroundColor: tea.colorHex }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#F2E5D6] leading-tight">{tea.nameRu}</div>
                    <div className="text-[11px] text-[#A68F80] truncate">{tea.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              id="got-it-btn"
              onClick={() => setShowInfo(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-[#402C23] hover:bg-[#4E372C] text-xs font-medium text-[#F7ECE1] border border-[#5E4233] transition-all"
            >
              Вернуться к чаю
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

