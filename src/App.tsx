/**
 * Cozy Tea Sort / Чайный купаж - Telegram Mini App Main Component
 *
 * Ownership:
 * - TeaSortLogic = puzzle truth
 * - TeaSortView  = rendering/input
 * - React App    = progression/meta UI (never decides puzzle legality)
 *
 * Progression semantics:
 * - currentLevel         = the puzzle currently being played
 * - highestUnlockedLevel = furthest progression legitimately earned
 * - level N -> N+1 happens ONLY via the victory flow (no footer skip)
 * - footer action reshuffles the SAME level ("Другой расклад")
 */

import { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Info,
  X,
  BookOpen,
  Coffee,
  AlertCircle,
  HelpCircle,
  Shuffle,
} from 'lucide-react';
import { CapacityObstacleSlot, CupConstraint, FloatingIngredientSlot, IceSlot, SinkingIngredientSlot, StrainerState, TEA_TYPES, TeaBudSlot, TeaId, cloneCupConstraint, normalizeCapacityObstacles, normalizeIceSlots, normalizeSinkingIngredients, normalizeStrainerState, normalizeTeaBudSlots } from './game/types';
import { TeaSortLogic } from './game/logic/teaSortLogic';
import { isWonState } from './game/logic/rules';
import { TeaSortView } from './game/view/TeaSortView';
import { audioSynth } from './game/audio/audioSynth';
import { telegram } from './game/telegram/telegramHaptics';
import { generateLevel } from './game/logic/generator';
import { generateRequestForLevelConfig } from './game/logic/productionRequest';
import { applyWin, MAX_PERSISTED_LEVEL } from './game/logic/progression';
import { loadProgress, saveProgress } from './game/storage';
import { makeProductionSeed } from './game/logic/rng';
import { TeaRoomBackground } from './components/TeaRoomBackground';
import { getLevelConfig } from './utils/difficultyCurve';
import { TEA_RECIPES, CUP_SKINS } from './data/teaRecipes';
import { CupSkinId, TeaRecipe, CupSkin, LevelConfig } from './types/tea';
import { RecipeBookModal } from './components/RecipeBookModal';
import { VictoryModal } from './components/VictoryModal';
import { RhythmBadge } from './components/RhythmBadge';
import { tutorialForConfig } from './game/ui/tutorials';

/**
 * G18 DEV-only visual/E2E launch controls.
 *
 * Enabled exclusively through Vite's `import.meta.env.DEV` (dead-code
 * eliminated from production builds). Production UX never parses these
 * params and the QA bridge is never installed in a release bundle.
 *
 * Supported query params:
 * - qaLevel: deterministic production level number
 * - qaSeed: deterministic level seed (defaults to the production seed)
 * - qaTutorial: 0 hides first-exposure banners (default: normal behaviour)
 */
interface QaLaunch {
  level: number;
  seed?: string;
  tutorial: boolean;
}

const QA_MODULE_START_MS = typeof performance !== 'undefined' ? performance.now() : 0;

function readQaLaunch(): QaLaunch | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('qaLevel')) return null;
    const rawLevel = Number(params.get('qaLevel'));
    if (!Number.isInteger(rawLevel) || rawLevel < 1 || rawLevel > MAX_PERSISTED_LEVEL) return null;
    const rawSeed = params.get('qaSeed');
    const tutorial = params.get('qaTutorial') !== '0';
    return {
      level: rawLevel,
      seed: rawSeed && rawSeed.length > 0 ? rawSeed : undefined,
      tutorial,
    };
  } catch {
    return null;
  }
}

interface QaCupGeometry {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hitPadX: number;
  hitPadY: number;
}

interface LevelBackupState {
  cups: TeaId[][];
  hiddenCounts: number[];
  cupConstraints: CupConstraint[];
  floatingIngredients: FloatingIngredientSlot[];
  strainer: StrainerState;
  sinkingIngredients: SinkingIngredientSlot[];
  iceSlots: IceSlot[];
  capacityObstacles: CapacityObstacleSlot[];
  teaBudSlots: TeaBudSlot[];
  blendRecipe?: import('./game/logic/blendRecipe').BlendRecipe | undefined;
}

export default function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TeaSortView | null>(null);
  const logicRef = useRef<TeaSortLogic | null>(null);

  // DEV-only deterministic launch (G18 visual/E2E harness). Null in release.
  const [qaLaunch] = useState<QaLaunch | null>(readQaLaunch);
  const tutorialsVisible = qaLaunch?.tutorial !== false;

  // Persisted progress is loaded once; refresh restarts the current puzzle
  // (acceptable for Gauntlet 0) but never regresses earned progression.
  const [initialProgress] = useState(() => {
    const stored = loadProgress();
    if (!qaLaunch) return stored;
    // QA launches are self-contained: the requested production level must
    // be playable even in a fresh browser profile.
    return {
      ...stored,
      currentLevel: qaLaunch.level,
      highestUnlockedLevel: Math.max(stored.highestUnlockedLevel, qaLaunch.level),
    };
  });

  const [currentLevel, setCurrentLevel] = useState<number>(initialProgress.currentLevel);
  const [highestUnlockedLevel, setHighestUnlockedLevel] = useState<number>(
    initialProgress.highestUnlockedLevel,
  );
  const [moves, setMoves] = useState<number>(0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [isWon, setIsWon] = useState<boolean>(false);
  const [isDeadlocked, setIsDeadlocked] = useState<boolean>(false);
  // Lemon-wrong deadlock variant: tea sorted but the lemon sits on the
  // wrong tea (derived accurately from the live logic at deadlock time).
  const [deadlockDetail, setDeadlockDetail] = useState<null | 'lemon'>(null);
  const [isMuted, setIsMuted] = useState<boolean>(() => audioSynth.muted);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showRecipeBook, setShowRecipeBook] = useState<boolean>(false);
  const [selectedCupIndex, setSelectedCupIndex] = useState<number | null>(null);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  // --- P0: runtime level context that never goes stale ---
  // The Pixi view is created once in useEffect([]). Its win callback must
  // NOT close over the initial React `currentLevel`. The view calls
  // onWin(boundLevel) with the level explicitly bound at startLevel time,
  // and this ref mirrors the currently played level for any other handler.
  const currentLevelRef = useRef<number>(initialProgress.currentLevel);
  const highestUnlockedRef = useRef<number>(initialProgress.highestUnlockedLevel);
  const equippedSkinRef = useRef<CupSkinId>(initialProgress.equippedSkin);
  const seedRef = useRef<string>('');
  // G18 DEV-only load instrumentation (read through the QA bridge). The
  // timestamps are harmless in production and never drive gameplay.
  const qaTimingsRef = useRef({
    moduleStart: QA_MODULE_START_MS,
    configReadyAt: 0,
    generatedAt: 0,
    boardMountedAt: 0,
    firstInputAt: 0,
  });

  const setCurrentLevelSafe = (lvl: number) => {
    currentLevelRef.current = lvl;
    setCurrentLevel(lvl);
    saveProgress({ currentLevel: lvl });
  };

  const setHighestUnlockedSafe = (lvl: number) => {
    highestUnlockedRef.current = lvl;
    setHighestUnlockedLevel(lvl);
    saveProgress({ highestUnlockedLevel: lvl });
  };

  // Meta-Progression State
  const [unlockedRecipeIds, setUnlockedRecipeIds] = useState<TeaId[]>(
    initialProgress.unlockedRecipes,
  );
  const [unlockedSkinIds, setUnlockedSkinIds] = useState<CupSkinId[]>(
    initialProgress.unlockedSkins,
  );

  const [equippedSkin, setEquippedSkin] = useState<CupSkinId>(initialProgress.equippedSkin);

  // Rewards achieved on current level completion (only when newly unlocked)
  const [justUnlockedRecipe, setJustUnlockedRecipe] = useState<TeaRecipe | undefined>();
  const [justUnlockedSkin, setJustUnlockedSkin] = useState<CupSkin | undefined>();

  // Initial state store for Level restart
  const initialLevelStateRef = useRef<LevelBackupState>({ cups: [], hiddenCounts: [], cupConstraints: [], floatingIngredients: [], strainer: { present: false, attachedCupIndex: null, heldTea: null }, sinkingIngredients: [], iceSlots: [], capacityObstacles: [], teaBudSlots: [] });
  const hintTimerRef = useRef<number | null>(null);

  const currentConfig: LevelConfig = getLevelConfig(currentLevel);
  // At the persisted product bound the "next" preview stays on MAX; the
  // victory flow must never imply an unlockable MAX + 1.
  const nextConfig: LevelConfig = getLevelConfig(
    Math.min(MAX_PERSISTED_LEVEL, currentLevel + 1),
  );
  const tutorial = tutorialForConfig(currentConfig);

  // Refs mirroring collections for the single-lifetime Pixi win callback.
  const unlockedRecipeIdsRef = useRef<TeaId[]>(initialProgress.unlockedRecipes);
  const unlockedSkinIdsRef = useRef<CupSkinId[]>(initialProgress.unlockedSkins);

  const buildLogicForLevel = (lvlNum: number, seed: string): TeaSortLogic => {
    const cfg = getLevelConfig(lvlNum);
    const generated = generateLevel(generateRequestForLevelConfig(cfg), seed);
    seedRef.current = generated.seed;

    initialLevelStateRef.current = {
      cups: generated.cups.map((c) => [...c]),
      hiddenCounts: [...generated.hiddenCounts],
      cupConstraints: generated.cupConstraints.map(cloneCupConstraint),
      floatingIngredients: [...generated.floatingIngredients],
      strainer: normalizeStrainerState(generated.strainer),
      sinkingIngredients: normalizeSinkingIngredients(generated.sinkingIngredients, generated.cups.length),
      iceSlots: normalizeIceSlots(generated.iceSlots, generated.cups.length),
      capacityObstacles: normalizeCapacityObstacles(generated.capacityObstacles, generated.cups.length),
      teaBudSlots: normalizeTeaBudSlots(generated.teaBudSlots, generated.cups.length),
      blendRecipe: generated.blendRecipe,
    };

    return new TeaSortLogic(
      generated.cups,
      generated.hiddenCounts,
      generated.cupConstraints,
      generated.floatingIngredients,
      normalizeStrainerState(generated.strainer),
      normalizeSinkingIngredients(generated.sinkingIngredients, generated.cups.length),
      normalizeIceSlots(generated.iceSlots, generated.cups.length),
      normalizeCapacityObstacles(generated.capacityObstacles, generated.cups.length),
      normalizeTeaBudSlots(generated.teaBudSlots, generated.cups.length),
      generated.blendRecipe,
    );
  };

  const bindLogicToView = (logic: TeaSortLogic, lvlNum: number) => {
    logicRef.current = logic;
    if (viewRef.current) {
      viewRef.current.logic = logic;
      viewRef.current.boundLevel = lvlNum;
      viewRef.current.setSkin(equippedSkinRef.current);
      viewRef.current.resetLevel();
    }
  };

  const resetTransientUi = () => {
    setMoves(0);
    setCanUndo(false);
    setIsWon(false);
    setIsDeadlocked(false);
    setDeadlockDetail(null);
    setSelectedCupIndex(null);
    setJustUnlockedRecipe(undefined);
    setJustUnlockedSkin(undefined);
  };

  /** Start (or restart) an explicit level. Does NOT touch highestUnlocked. */
  const startLevel = (lvlNum: number, seed?: string) => {
    const effectiveSeed =
      seed ??
      (qaLaunch?.seed && lvlNum === qaLaunch.level
        ? qaLaunch.seed
        : makeProductionSeed(lvlNum));
    const logic = buildLogicForLevel(lvlNum, effectiveSeed);
    setCurrentLevelSafe(lvlNum);
    resetTransientUi();
    bindLogicToView(logic, lvlNum);
  };

  /** Footer action: a fresh puzzle for the SAME level (never a skip). */
  const reshuffleCurrentLevel = () => {
    const lvl = currentLevelRef.current;
    const seed = qaLaunch?.seed
      ? `${qaLaunch.seed}:reshuffle:${Date.now().toString(36)}`
      : makeProductionSeed(lvl);
    startLevel(lvl, seed);
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  useEffect(() => {
    telegram.init();

    const container = canvasContainerRef.current;
    if (!container) return;

    // Sync refs with the (already loaded) initial progress.
    currentLevelRef.current = initialProgress.currentLevel;
    highestUnlockedRef.current = initialProgress.highestUnlockedLevel;
    equippedSkinRef.current = initialProgress.equippedSkin;

    const initialLvl = initialProgress.currentLevel;
    const cfg = getLevelConfig(initialLvl);
    qaTimingsRef.current.configReadyAt = performance.now();
    const generated = generateLevel(
      generateRequestForLevelConfig(cfg),
      qaLaunch?.seed ?? makeProductionSeed(initialLvl),
    );
    qaTimingsRef.current.generatedAt = performance.now();
    seedRef.current = generated.seed;

    initialLevelStateRef.current = {
      cups: generated.cups.map((c) => [...c]),
      hiddenCounts: [...generated.hiddenCounts],
      cupConstraints: generated.cupConstraints.map(cloneCupConstraint),
      floatingIngredients: [...generated.floatingIngredients],
      strainer: normalizeStrainerState(generated.strainer),
      sinkingIngredients: normalizeSinkingIngredients(generated.sinkingIngredients, generated.cups.length),
      iceSlots: normalizeIceSlots(generated.iceSlots, generated.cups.length),
      capacityObstacles: normalizeCapacityObstacles(generated.capacityObstacles, generated.cups.length),
      teaBudSlots: normalizeTeaBudSlots(generated.teaBudSlots, generated.cups.length),
      blendRecipe: generated.blendRecipe,
    };

    const logic = new TeaSortLogic(
      generated.cups,
      generated.hiddenCounts,
      generated.cupConstraints,
      generated.floatingIngredients,
      normalizeStrainerState(generated.strainer),
      normalizeSinkingIngredients(generated.sinkingIngredients, generated.cups.length),
      normalizeIceSlots(generated.iceSlots, generated.cups.length),
      normalizeCapacityObstacles(generated.capacityObstacles, generated.cups.length),
      normalizeTeaBudSlots(generated.teaBudSlots, generated.cups.length),
      generated.blendRecipe,
    );
    logicRef.current = logic;

    let isDisposed = false;

    const view = new TeaSortView(container, logic, {
      // P0: the view outlives every level (single Pixi lifetime), so ALL
      // callbacks needing the gameplay model MUST read logicRef.current.
      // Never close over the mount-time `logic` instance here.
      onMoveComplete: () => {
        if (isDisposed) return;
        const activeLogic = logicRef.current;
        if (!activeLogic) return;
        setMoves(activeLogic.movesCount);
        setCanUndo(activeLogic.canUndo);
      },
      // completedLevel comes from view.boundLevel — immune to stale closures.
      onWin: (completedLevel) => {
        if (isDisposed) return;

        const cfg = getLevelConfig(completedLevel);
        const result = applyWin(
          {
            highestUnlockedLevel: highestUnlockedRef.current,
            unlockedRecipes: unlockedRecipeIdsRef.current,
            unlockedSkins: unlockedSkinIdsRef.current,
          },
          completedLevel,
          { recipeId: cfg.rewardRecipeId, skinId: cfg.rewardSkinId },
        );

        // Persist progression intentionally (never regress on reload).
        setHighestUnlockedSafe(result.highestUnlockedLevel);
        if (result.isNewRecipe || result.unlockedRecipes !== unlockedRecipeIdsRef.current) {
          unlockedRecipeIdsRef.current = result.unlockedRecipes;
          setUnlockedRecipeIds(result.unlockedRecipes);
          saveProgress({ unlockedRecipes: result.unlockedRecipes });
        }
        if (result.isNewSkin || result.unlockedSkins !== unlockedSkinIdsRef.current) {
          unlockedSkinIdsRef.current = result.unlockedSkins;
          setUnlockedSkinIds(result.unlockedSkins);
          saveProgress({ unlockedSkins: result.unlockedSkins });
        }

        // Only announce "new unlock" UI when the collection actually changed.
        setJustUnlockedRecipe(
          result.isNewRecipe && cfg.rewardRecipeId
            ? TEA_RECIPES.find((r) => r.id === cfg.rewardRecipeId)
            : undefined,
        );
        setJustUnlockedSkin(
          result.isNewSkin && cfg.rewardSkinId
            ? CUP_SKINS.find((s) => s.id === cfg.rewardSkinId)
            : undefined,
        );
        setIsWon(true);
        setIsDeadlocked(false);
        setCanUndo(false);
      },
      onDeadlock: () => {
        if (isDisposed) return;
        // Lemon-wrong variant, derived accurately from live logic (Gauntlet
        // 5 §70): tea sorted, puzzle not won, an ingredient still present.
        const active = logicRef.current;
        let detail: null | 'lemon' = null;
        if (active) {
          const st = active.toState();
          if (
            isWonState(st.cups, st.cupConstraints) &&
            !active.isWon() &&
            st.floatingIngredients.some((s) => s !== null)
          ) {
            detail = 'lemon';
          }
        }
        setDeadlockDetail(detail);
        setIsDeadlocked(true);
      },
      onSelectCup: (idx) => {
        if (isDisposed) return;
        if (idx !== null && qaTimingsRef.current.firstInputAt === 0) {
          qaTimingsRef.current.firstInputAt = performance.now();
        }
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
    view.boundLevel = initialLvl;

    view.init().then(() => {
      if (isDisposed) {
        view.destroy();
        return;
      }
      viewRef.current = view;
      view.setSkin(equippedSkinRef.current);
      view.layoutCups();
      view.renderAllCups();
      qaTimingsRef.current.boardMountedAt = performance.now();

      // G18 DEV-only deterministic QA bridge. Never installed in release
      // builds (import.meta.env.DEV is statically false there).
      if (qaLaunch && import.meta.env.DEV) {
        const qaBridge = {
          version: 1,
          moduleStart: QA_MODULE_START_MS,
          readyAt: performance.now(),
          get level(): number {
            return currentLevelRef.current;
          },
          get seed(): string {
            return seedRef.current;
          },
          get moves(): number {
            return logicRef.current?.movesCount ?? 0;
          },
          get canUndo(): boolean {
            return logicRef.current?.canUndo ?? false;
          },
          get isWon(): boolean {
            return logicRef.current?.isWon() ?? false;
          },
          isReady(): boolean {
            return viewRef.current === view;
          },
          isAnimating(): boolean {
            return viewRef.current?.isAnimating ?? false;
          },
          timings(): {
            moduleStart: number;
            configReadyAt: number;
            generatedAt: number;
            boardMountedAt: number;
            firstInputAt: number;
          } {
            return { ...qaTimingsRef.current };
          },
          debugCounts(): {
            cups: number;
            stageChildren: number;
            tickerListeners: number;
            canvases: number;
          } {
            const active = viewRef.current;
            return {
              cups: active?.cupViews.length ?? 0,
              stageChildren: active?.app.stage.children.length ?? 0,
              tickerListeners: active?.app.ticker.count ?? 0,
              canvases: document.querySelectorAll('canvas').length,
            };
          },
          getState() {
            return logicRef.current?.toState() ?? null;
          },
          cupGeometry(): QaCupGeometry[] {
            const active = viewRef.current;
            const canvas = active?.canvas;
            if (!active || !canvas) return [];
            const rect = canvas.getBoundingClientRect();
            return active.cupViews.map((v) => {
              const padX = v.isTeapot ? 22 : v.isSinkOnly || v.isTastingBowl || v.isThermos ? 20 : 16;
              const padBottom = v.isSinkOnly ? 40 : 32;
              return {
                index: v.index,
                x: rect.left + v.container.x,
                y: rect.top + v.container.y,
                width: v.visualWidth,
                height: v.visualHeight,
                hitPadX: padX,
                hitPadY: padBottom,
              };
            });
          },
          tapCup(index: number): void {
            (view as unknown as { handleCupClick(i: number): void }).handleCupClick(index);
          },
          canMove(from: number, to: number): boolean {
            return logicRef.current?.canMakeMove(from, to) ?? false;
          },
          firstLegalMove(): { from: number; to: number } | null {
            const active = logicRef.current;
            if (!active) return null;
            for (let from = 0; from < active.cups.length; from++) {
              for (let to = 0; to < active.cups.length; to++) {
                if (from !== to && active.canMakeMove(from, to)) return { from, to };
              }
            }
            return null;
          },
          async autoSolve(): Promise<{ ok: boolean; moves: number; reason?: string }> {
            const active = logicRef.current;
            const activeView = viewRef.current;
            if (!active || !activeView) return { ok: false, moves: 0, reason: 'not-ready' };
            const { solvePuzzle } = await import('./game/logic/solver');
            const st = active.toState();
            const solved = solvePuzzle(st.cups, {
              cupConstraints: st.cupConstraints,
              floatingIngredients: st.floatingIngredients,
              sinkingIngredients: st.sinkingIngredients,
              strainer: st.strainer,
              iceSlots: st.iceSlots,
              capacityObstacles: st.capacityObstacles,
              teaBudSlots: st.teaBudSlots,
              blendRecipe: active.blendRecipe,
              maxVisited: 120_000,
              maxDepth: 60,
            });
            if (!solved.solvable || !solved.solution) {
              return { ok: false, moves: active.movesCount, reason: 'unsolvable' };
            }
            const waitIdle = async (): Promise<void> => {
              for (let i = 0; i < 240; i++) {
                if (!viewRef.current?.isAnimating) return;
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
            };
            for (const action of solved.solution) {
              if (action.kind !== 'pour') continue;
              const bridge = (
                window as unknown as { __cozyTeaQa?: { tapCup(i: number): void } }
              ).__cozyTeaQa;
              if (!bridge) return { ok: false, moves: active.movesCount, reason: 'bridge-gone' };
              bridge.tapCup(action.from);
              bridge.tapCup(action.to);
              await waitIdle();
              if (active.isWon()) break;
            }
            return { ok: active.isWon(), moves: active.movesCount };
          },
        };
        (window as unknown as { __cozyTeaQa?: typeof qaBridge }).__cozyTeaQa = qaBridge;
      }
    }).catch((err) => {
      console.error('Failed to init TeaSortView:', err);
    });

    return () => {
      isDisposed = true;
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // Single Pixi lifetime: progression flows through refs + boundLevel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs mirroring collections for the stable win callback (declared above).
  const handleUndo = () => {
    if (!viewRef.current || !logicRef.current || !canUndo) return;
    viewRef.current.undoMove();
    setMoves(logicRef.current.movesCount);
    setCanUndo(logicRef.current.canUndo);
    setIsDeadlocked(false);
    setDeadlockDetail(null);
  };

  const handleRestart = () => {
    if (!viewRef.current || !logicRef.current) return;
    const backup = initialLevelStateRef.current;
    const restoredCups = backup.cups.map((c) => [...c]);
    const restoredHidden = [...backup.hiddenCounts];
    const restoredConstraints = (backup.cupConstraints ?? []).map(cloneCupConstraint);
    const restoredSlots = [...(backup.floatingIngredients ?? [])];
    const restoredStrainer = normalizeStrainerState(backup.strainer);
    const restoredSinking = normalizeSinkingIngredients(backup.sinkingIngredients, restoredCups.length);
    const restoredIce = normalizeIceSlots(backup.iceSlots, restoredCups.length);
    const restoredObstacles = normalizeCapacityObstacles(backup.capacityObstacles, restoredCups.length);
    const restoredBuds = normalizeTeaBudSlots(backup.teaBudSlots, restoredCups.length);
    const restoredBlend = backup.blendRecipe;

    logicRef.current.initFromState(restoredCups, restoredHidden, restoredConstraints, restoredSlots, restoredStrainer, restoredSinking, restoredIce, restoredObstacles, restoredBuds, restoredBlend);
    viewRef.current.logic = logicRef.current;
    viewRef.current.setSkin(equippedSkinRef.current);
    viewRef.current.resetLevel();

    setMoves(0);
    setCanUndo(false);
    setIsWon(false);
    setIsDeadlocked(false);
    setDeadlockDetail(null);
    setSelectedCupIndex(null);
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  /** The ONLY legitimate N -> N+1 transition: via the victory flow. */
  const handleNextLevel = () => {
    const completed = currentLevelRef.current;
    // Product progression is bounded: completing MAX cannot start MAX + 1.
    const next = Math.min(MAX_PERSISTED_LEVEL, completed + 1);
    startLevel(
      next,
      qaLaunch?.seed ? `${qaLaunch.seed}:next:${next}` : makeProductionSeed(next),
    );
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  const toggleSound = () => {
    const muted = audioSynth.toggleMute();
    setIsMuted(muted);
    saveProgress({ muted });
    telegram.hapticSelection();
  };

  const handleSelectSkin = (skinId: CupSkinId) => {
    // Skins unlock via progression; ignore locked picks defensively.
    if (!unlockedSkinIds.includes(skinId)) return;
    equippedSkinRef.current = skinId;
    setEquippedSkin(skinId);
    saveProgress({ equippedSkin: skinId });
    if (viewRef.current) {
      viewRef.current.setSkin(skinId);
    }
    audioSynth.playSelect();
    telegram.hapticSelection();
  };

  const selectedCup = selectedCupIndex !== null ? logicRef.current?.cups[selectedCupIndex] : undefined;
  const selectedTea = selectedCup?.topLayer ? TEA_TYPES[selectedCup.topLayer] : null;

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
              <span id="level-number" className="text-[10px] sm:text-[11px] text-[#A68F80]">
                #{currentLevel}
              </span>
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
            className="relative min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#30211B] border border-[#48342B] flex items-center justify-center text-[#E8985E] hover:bg-[#3D2B23] active:scale-95 transition-all"
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
            className="relative min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#30211B] border border-[#48342B] flex items-center justify-center text-[#D8C2B2] hover:bg-[#3D2B23] active:scale-95 transition-all"
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
            className="relative min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#30211B] border border-[#48342B] flex items-center justify-center text-[#D8C2B2] hover:bg-[#3D2B23] active:scale-95 transition-all"
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

      {/* G18 one-time first-exposure tutorial (centralized registry). */}
      {tutorial && moves === 0 && !isWon && tutorialsVisible && (
        <div
          id={tutorial.bannerId}
          className="shrink-0 px-3 py-1.5 border-b flex items-center justify-center gap-1.5 text-[10.5px] sm:text-[11px] z-10 text-center"
          style={{
            backgroundColor: `${tutorial.tone.background}F2`,
            borderColor: tutorial.tone.border,
            color: tutorial.tone.text,
          }}
        >
          <Coffee className="w-3.5 h-3.5 shrink-0" style={{ color: tutorial.tone.icon }} />
          <span>{tutorial.text}</span>
        </div>
      )}

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
              <div className="text-[11px] text-[#E0AAB2]">
                {deadlockDetail === 'lemon'
                  ? 'Чай собран, но лимон должен остаться на облепиховом.'
                  : 'Отмените последний ход или начните заново'}
              </div>
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
          id="reshuffle-btn"
          onClick={reshuffleCurrentLevel}
          title="Новый расклад того же уровня — прогрессия открывается только победой"
          className="min-h-[44px] flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl bg-[#523A25] hover:bg-[#63462E] border border-[#7D5A3C] text-[#FFE8CD] text-xs font-medium shadow-sm active:scale-[0.98] transition-all"
        >
          <Shuffle className="w-3.5 h-3.5 text-[#F4A460] shrink-0" />
          <span className="truncate">Другой расклад</span>
        </button>
      </footer>

      {/* Victory Modal with Meta-Progression & Next Rhythm Phase */}
      <VictoryModal
        isOpen={isWon}
        level={currentLevelRef.current}
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
        currentLevel={highestUnlockedLevel}
        activeSkinId={equippedSkin}
        unlockedSkinIds={unlockedSkinIds}
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
                aria-label="Закрыть правила"
                className="relative w-11 h-11 rounded-lg bg-[#30211B] flex items-center justify-center text-[#B39D8D] hover:text-[#FFF]"
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
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8B878] font-bold">🫖</span>
                <span>Из чайника можно только разливать чай. Налить чай обратно в него нельзя.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#C9A8E8] font-bold">🍵</span>
                <span>Чашка гостя принимает чай, но не отдаёт его обратно.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#8AC9A8] font-bold">🍶</span>
                <span>Дегустационная пиала вмещает только 2 слоя и к концу должна быть пустой.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8C85E] font-bold">🍋</span>
                <span>Лимон переезжает при переливании из его чашки и должен закончить на полном облепиховом чае.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#8AC9D4] font-bold">🥄</span>
                <span>Ситечко задерживает один слой во время переливания. Пока слой остаётся в ситечке, его нужно отдельно вернуть в подходящий сосуд.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#8AC9D4] font-bold">🥄</span>
                <span>Перестановка пустого ситечка не считается ходом.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8A83E] font-bold">🍯</span>
                <span>Мёд остаётся на дне и переезжает только с последним переливанием из опустевшего сосуда. В финале он должен быть под полным гречишным чаем.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8C85E] font-bold">🍋🍯</span>
                <span>Если в сосуде встретились лимон и мёд, они всё равно двигаются по своим правилам: лимон уезжает с любым переливанием, а мёд остаётся на дне до полного опустошения сосуда.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#8AC9E8] font-bold">🧊</span>
                <span>Из замёрзшей чашки нельзя переливать. Налей в неё облепиховый чай — лёд растает, и чашка станет обычной.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8C878] font-bold">🧉</span>
                <span>Высокий термос вмещает 5 слоёв и переливает чай как обычная чашка. Но в конце уровня термос должен остаться пустым.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8A05E] font-bold">🪵</span>
                <span>Пока в чашке палочка корицы, в неё помещается только 2 слоя. Полностью опустоши чашку — палочка уберётся, и чашка снова будет вмещать 4.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#9AC878] font-bold">🌱</span>
                <span>Чайный бутон распустится, когда его чашка полностью опустеет. После этого чашка остаётся обычной и её можно снова использовать.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#D8A05E] font-bold">🥛</span>
                <span>Если чёрный чай и молоко соприкасаются, они соединяются в один слой молочного чая. Реакция работает в обе стороны.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#B8C898] font-bold">①</span>
                <span>Чашками ① и ② можно пользоваться во время сортировки как обычными. Но полностью собрать их нужно по порядку: сначала ①, затем ②. Поданную чашку больше нельзя переливать.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#C8A878] font-bold">🍽️</span>
                <span>Две чашки на общем подносе делят вместимость: вместе в них может быть не больше 6 слоёв чая. Переливая чай с подноса наружу, ты освобождаешь место для любой из этих двух чашек.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#D8A0AC] font-bold">🌸</span>
                <span>Две парные пиалы в конце должны содержать один и тот же чай — по 2 одинаковых слоя в каждой. Цвет заранее не задан: подходящий чай выбирается по ходу решения.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#E8C878] font-bold">🏵️</span>
                <span>
                  Именная сервировка: чашка с золотым знаком должна в конце содержать именно свой чай. Во
                  время игры её можно использовать как обычную чашку.
                </span>
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
