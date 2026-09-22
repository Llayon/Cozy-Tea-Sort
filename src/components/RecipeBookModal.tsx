import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  X,
  Coffee,
  Check,
  Lock,
  Thermometer,
  Clock,
  Heart,
  Droplets,
  Layers,
} from 'lucide-react';
import { TEA_RECIPES, CUP_SKINS } from '../data/teaRecipes';
import { CupSkinId, TeaId } from '../types/tea';

interface RecipeBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  unlockedRecipeIds: TeaId[];
  currentLevel: number;
  activeSkinId: CupSkinId;
  onSelectSkin: (skinId: CupSkinId) => void;
}

export function RecipeBookModal({
  isOpen,
  onClose,
  unlockedRecipeIds,
  currentLevel,
  activeSkinId,
  onSelectSkin,
}: RecipeBookModalProps) {
  const [activeTab, setActiveTab] = useState<'recipes' | 'service' | 'breath'>('recipes');
  const [selectedRecipeId, setSelectedRecipeId] = useState<TeaId>('matcha');

  if (!isOpen) return null;

  const selectedRecipe =
    TEA_RECIPES.find((r) => r.id === selectedRecipeId) || TEA_RECIPES[0];
  const isSelectedUnlocked = unlockedRecipeIds.includes(selectedRecipe.id);

  return (
    <div
      id="recipe-book-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        id="recipe-book-modal-container"
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-[#221814] border border-[#523B2E] rounded-3xl shadow-2xl text-[#F3EAD8] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3D2B22] bg-[#2A1D17]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[#E8985E]/20 text-[#E8985E] border border-[#E8985E]/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-['Comfortaa'] text-[#F7EFE3] flex items-center gap-2">
                Чайная книга и сервиз
              </h2>
              <p className="text-xs text-[#C2AA94]">
                Коллекция авторских купажей и посуды мастера
              </p>
            </div>
          </div>
          <button
            id="close-recipe-book-button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#C2AA94] hover:text-[#F3EAD8] hover:bg-[#3D2B22] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#3D2B22] bg-[#1E1410] px-4 pt-2 gap-2">
          <button
            id="tab-recipes-button"
            onClick={() => setActiveTab('recipes')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'recipes'
                ? 'border-[#E8985E] text-[#F7EFE3] bg-[#2A1D17]'
                : 'border-transparent text-[#A8917D] hover:text-[#E2D2C2]'
            }`}
          >
            <Coffee className="w-4 h-4" />
            <span>Книга рецептов ({unlockedRecipeIds.length}/{TEA_RECIPES.length})</span>
          </button>
          <button
            id="tab-service-button"
            onClick={() => setActiveTab('service')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'service'
                ? 'border-[#E8985E] text-[#F7EFE3] bg-[#2A1D17]'
                : 'border-transparent text-[#A8917D] hover:text-[#E2D2C2]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Чайный сервиз</span>
          </button>
          <button
            id="tab-breath-button"
            onClick={() => setActiveTab('breath')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'breath'
                ? 'border-[#E8985E] text-[#F7EFE3] bg-[#2A1D17]'
                : 'border-transparent text-[#A8917D] hover:text-[#E2D2C2]'
            }`}
          >
            <Heart className="w-4 h-4" />
            <span>Дыхание игры</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'recipes' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Recipe Selector List */}
              <div className="md:col-span-5 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                {TEA_RECIPES.map((recipe) => {
                  const isUnlocked = unlockedRecipeIds.includes(recipe.id);
                  const isSelected = selectedRecipeId === recipe.id;

                  return (
                    <button
                      key={recipe.id}
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      className={`flex items-center gap-3 p-3 rounded-2xl text-left border transition-all shrink-0 md:shrink w-52 md:w-full ${
                        isSelected
                          ? 'bg-[#3A281E] border-[#E8985E] shadow-lg'
                          : isUnlocked
                          ? 'bg-[#2A1D17] border-[#473327] hover:border-[#6B4F3D]'
                          : 'bg-[#1C130E] border-[#302118] opacity-60'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/20 shadow-inner"
                        style={{ backgroundColor: recipe.colorHex }}
                      >
                        {isUnlocked ? (
                          <Coffee className="w-5 h-5 text-black/60" />
                        ) : (
                          <Lock className="w-4 h-4 text-white/80" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold truncate text-[#F7EFE3]">
                            {recipe.title}
                          </p>
                        </div>
                        <p className="text-[11px] text-[#C2AA94] truncate">
                          {isUnlocked ? recipe.subtitle : `Уровень ${recipe.unlockLevel}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Recipe Detail Card */}
              <div className="md:col-span-7 bg-[#2A1D17] border border-[#473327] rounded-3xl p-5 space-y-4">
                {isSelectedUnlocked ? (
                  <>
                    <div className="flex items-start justify-between gap-3 border-b border-[#3D2B22] pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full inline-block border border-white/30"
                            style={{ backgroundColor: selectedRecipe.colorHex }}
                          />
                          <h3 className="text-base sm:text-lg font-bold font-['Comfortaa'] text-[#F7EFE3]">
                            {selectedRecipe.title}
                          </h3>
                        </div>
                        <p className="text-xs text-[#E8985E] mt-0.5">
                          {selectedRecipe.subtitle}
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#84B866]/20 text-[#A6D488] border border-[#84B866]/30 font-medium">
                        Изучен
                      </span>
                    </div>

                    {/* Tasting notes */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs uppercase tracking-wider text-[#A8917D] font-bold">
                        Вкусовой профиль
                      </h4>
                      <p className="text-xs sm:text-sm text-[#E2D2C2] leading-relaxed">
                        {selectedRecipe.tastingNotes}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedRecipe.flavorNotes.map((note, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] px-2 py-0.5 rounded-lg bg-[#3D2B22] text-[#F3EAD8] border border-[#523B2E]"
                          >
                            🌿 {note}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Ingredients */}
                    <div className="space-y-1.5 pt-1">
                      <h4 className="text-xs uppercase tracking-wider text-[#A8917D] font-bold">
                        Ингредиенты купажа
                      </h4>
                      <ul className="text-xs text-[#C2AA94] space-y-1">
                        {selectedRecipe.ingredients.map((ing, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#E8985E]" />
                            <span>{ing}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Brewing specs */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#3D2B22]">
                      <div className="bg-[#1F1510] p-2.5 rounded-xl border border-[#3A281E] text-center">
                        <Thermometer className="w-4 h-4 mx-auto text-[#E8985E] mb-1" />
                        <span className="text-[10px] text-[#A8917D] block">Температура</span>
                        <span className="text-xs font-bold text-[#F3EAD8]">
                          {selectedRecipe.brewing.temp}
                        </span>
                      </div>
                      <div className="bg-[#1F1510] p-2.5 rounded-xl border border-[#3A281E] text-center">
                        <Clock className="w-4 h-4 mx-auto text-[#E8985E] mb-1" />
                        <span className="text-[10px] text-[#A8917D] block">Пролив / Настой</span>
                        <span className="text-xs font-bold text-[#F3EAD8]">
                          {selectedRecipe.brewing.time}
                        </span>
                      </div>
                      <div className="bg-[#1F1510] p-2.5 rounded-xl border border-[#3A281E] text-center">
                        <Droplets className="w-4 h-4 mx-auto text-[#E8985E] mb-1" />
                        <span className="text-[10px] text-[#A8917D] block">Объем</span>
                        <span className="text-xs font-bold text-[#F3EAD8]">
                          {selectedRecipe.brewing.portion}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#1C130E] border border-[#3A281E] flex items-center justify-center mx-auto text-[#8A7360]">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-[#E2D2C2]">
                      Рецепт пока закрыт
                    </h3>
                    <p className="text-xs text-[#8A7360] max-w-xs mx-auto">
                      Пройдите уровень {selectedRecipe.unlockLevel}, чтобы открыть купаж «
                      {selectedRecipe.title}» в вашей личной книге.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'service' && (
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-[#C2AA94]">
                Выберите материал и оформление посуды для чайной церемонии. Завершая этапы мастерства, вы открываете новые формы сервиза:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CUP_SKINS.map((skin) => {
                  const isUnlocked = currentLevel >= skin.unlockLevel;
                  const isEquipped = activeSkinId === skin.id;

                  return (
                    <div
                      key={skin.id}
                      className={`relative p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                        isEquipped
                          ? 'bg-[#3A281E] border-[#E8985E] shadow-lg'
                          : isUnlocked
                          ? 'bg-[#2A1D17] border-[#473327]'
                          : 'bg-[#1C130E] border-[#302118] opacity-60'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Cup Visual Preview Icon */}
                        <div className="w-16 h-20 mx-auto rounded-b-xl border-2 flex items-end justify-center pb-2 relative overflow-hidden"
                             style={{
                               borderColor: skin.borderColor,
                               backgroundColor: skin.fillColor,
                             }}>
                          <div
                            className="w-10 h-7 rounded-sm opacity-80"
                            style={{ backgroundColor: '#84B866' }}
                          />
                          <div
                            className="absolute top-1 right-1 w-2 h-8 rounded-full opacity-40"
                            style={{ backgroundColor: skin.accentColor }}
                          />
                        </div>

                        <h4 className="text-sm font-bold text-center text-[#F7EFE3] pt-1">
                          {skin.name}
                        </h4>
                        <p className="text-[11px] text-[#A8917D] text-center leading-snug">
                          {skin.description}
                        </p>
                      </div>

                      <div className="pt-4">
                        {isEquipped ? (
                          <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#E8985E]/20 text-[#E8985E] text-xs font-bold border border-[#E8985E]/30">
                            <Check className="w-4 h-4" />
                            <span>Выбрано</span>
                          </div>
                        ) : isUnlocked ? (
                          <button
                            onClick={() => onSelectSkin(skin.id)}
                            className="w-full py-2 rounded-xl bg-[#4A3223] hover:bg-[#5C3E2C] text-[#F3EAD8] text-xs font-bold transition-colors border border-[#6B4B35]"
                          >
                            Использовать
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#180F0B] text-[#7A6453] text-xs font-medium border border-[#2B1B13]">
                            <Lock className="w-3.5 h-3.5" />
                            <span>С уровня {skin.unlockLevel}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'breath' && (
            <div className="space-y-4 bg-[#2A1D17] border border-[#473327] rounded-3xl p-5">
              <h3 className="text-base font-bold font-['Comfortaa'] text-[#F7EFE3]">
                Философия ритма «Дыхание»
              </h3>
              <p className="text-xs sm:text-sm text-[#C2AA94] leading-relaxed">
                В нашей чайной комнате сложность не растет бесконечной непреодолимой горой. Мы верим в ритм естественного дыхания: чередование вдохновенной концентрации и согревающего расслабления.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-[#1F1510] p-3.5 rounded-2xl border border-[#3A281E]">
                  <span className="text-xs font-bold text-[#84B866] block mb-1">
                    1. Разминка (Вдох)
                  </span>
                  <p className="text-[11px] text-[#A8917D]">
                    5 аккуратных чашек. Решается быстро за 4–6 ходов, чтобы настроиться на звуки переливания и медитативный покой.
                  </p>
                </div>

                <div className="bg-[#1F1510] p-3.5 rounded-2xl border border-[#3A281E]">
                  <span className="text-xs font-bold text-[#FFA834] block mb-1">
                    2. Легкий вызов (Баланс)
                  </span>
                  <p className="text-[11px] text-[#A8917D]">
                    6 чашек. Требует приятного расчетливого взгляда на 2–3 хода вперед без спешки и напряжения.
                  </p>
                </div>

                <div className="bg-[#1F1510] p-3.5 rounded-2xl border border-[#3A281E]">
                  <span className="text-xs font-bold text-[#D6405C] block mb-1">
                    3. Пик мастерства (Задачка)
                  </span>
                  <p className="text-[11px] text-[#A8917D]">
                    7 чашек (максимум для комфортного экрана) и «Таинственный настой» со скрытым нижним слоем под пенкой.
                  </p>
                </div>

                <div className="bg-[#1F1510] p-3.5 rounded-2xl border border-[#3A281E]">
                  <span className="text-xs font-bold text-[#F2C94C] block mb-1">
                    4. Релакс-награда (Выдох)
                  </span>
                  <p className="text-[11px] text-[#A8917D]">
                    Резкий спад сложности! Простой, невероятно красивый уровень на 5 чашек, открывающий новый золотистый чай.
                  </p>
                </div>
              </div>

              <div className="bg-[#1C130E] p-3 rounded-2xl border border-[#38261B] text-xs text-[#C2AA94]">
                🌿 <strong>Главное правило:</strong> никаких таймеров, поражений и штрафов. Неограниченная отмена ходов и перезапуск в один клик.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#3D2B22] bg-[#2A1D17] flex items-center justify-between">
          <span className="text-xs text-[#A8917D]">
            Ваш текущий уровень мастера: <strong className="text-[#F7EFE3]">{currentLevel}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#E8985E] hover:bg-[#d8874d] text-[#1A120D] text-xs font-bold transition-all shadow-md active:scale-95"
          >
            Вернуться к чаю
          </button>
        </div>
      </div>
    </div>
  );
}
