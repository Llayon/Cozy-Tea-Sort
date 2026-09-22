import React from 'react';

/**
 * Декоративный фон «Уютная чайная комната» (Cozy Tea Room).
 * Размещается под WebGL/Canvas слоем с кружками.
 * Теплый, ясный и уютный интерьер:
 * - Полки с глиняным чайником, тяваном, баночками с яркими чаями и травами
 * - Светящийся теплый фонарик с мягким золотистым светом
 * - Деревянные панели сёдзи и подвесные травы
 * - Яркая и читаемая палитра, четко видимая на экранах любого формата (mobile и desktop)
 */
export const TeaRoomBackground: React.FC = () => {
  return (
    <div
      id="tea-room-background"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full overflow-hidden select-none"
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMin slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Фоновый свет стены чайной комнаты (теплая штукатурка/дерево) */}
          <radialGradient id="wallWarmth" cx="50%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#543A2A" />
            <stop offset="45%" stopColor="#3D291D" />
            <stop offset="85%" stopColor="#2A1B13" />
            <stop offset="100%" stopColor="#1E120C" />
          </radialGradient>

          {/* Яркое золотистое свечение от чайного фонаря */}
          <radialGradient id="lampGlow" cx="50%" cy="20%" r="50%">
            <stop offset="0%" stopColor="#FFC875" stopOpacity="0.45" />
            <stop offset="35%" stopColor="#E6953C" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#A85E22" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#2A1B13" stopOpacity="0" />
          </radialGradient>

          {/* Боковое теплое окно с мягким рассветом/закатом */}
          <radialGradient id="windowSunlight" cx="15%" cy="20%" r="45%">
            <stop offset="0%" stopColor="#FFE0A3" stopOpacity="0.35" />
            <stop offset="40%" stopColor="#D98A3B" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#2A1B13" stopOpacity="0" />
          </radialGradient>

          {/* Богатый дубовый/ореховый градиент деревянных полок */}
          <linearGradient id="oakShelf" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8C5C3D" />
            <stop offset="20%" stopColor="#754A2F" />
            <stop offset="70%" stopColor="#57351F" />
            <stop offset="100%" stopColor="#382112" />
          </linearGradient>

          {/* Золотистая светящаяся верхняя кромка полки */}
          <linearGradient id="shelfTopRim" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A6734E" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#E0A775" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#A6734E" stopOpacity="0.6" />
          </linearGradient>

          {/* Тень под полкой */}
          <linearGradient id="shelfDropShadow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#120A06" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#120A06" stopOpacity="0" />
          </linearGradient>

          {/* Керамика: селадон (зеленый нефрит) */}
          <linearGradient id="celadonGlaze" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5D8063" />
            <stop offset="45%" stopColor="#87AB8D" />
            <stop offset="100%" stopColor="#4A6950" />
          </linearGradient>

          {/* Глиняный чайник: теплая терракота / исинская глина */}
          <linearGradient id="terracottaClay" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A04832" />
            <stop offset="40%" stopColor="#CF654B" />
            <stop offset="100%" stopColor="#7C3220" />
          </linearGradient>

          {/* Лавандовая керамика */}
          <linearGradient id="lavenderPot" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7B719E" />
            <stop offset="45%" stopColor="#A59BD1" />
            <stop offset="100%" stopColor="#5D537E" />
          </linearGradient>

          {/* Стеклянные баночки со сборами */}
          <linearGradient id="glassJarGleam" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
          </linearGradient>

          {/* Бамбуковая решетка сёдзи */}
          <pattern id="shojiGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="#2E1F17" fillOpacity="0.4" />
            <path
              d="M 40,0 L 40,40 M 0,40 L 40,40"
              fill="none"
              stroke="#543A2A"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>

        {/* 1. БАЗОВАЯ ТЕПЛАЯ СТЕНА */}
        <rect width="1200" height="800" fill="url(#wallWarmth)" />

        {/* 2. РЕШЕТЧАТЫЕ ДЕРЕВЯННЫЕ ОКНА / ПАНЕЛИ СЁДЗИ ВВЕРХУ */}
        <g id="shoji-windows">
          {/* Левое окно */}
          <rect x="60" y="15" width="280" height="150" rx="4" fill="#38251B" stroke="#664431" strokeWidth="3" />
          <rect x="65" y="20" width="270" height="140" fill="url(#shojiGrid)" />
          <line x1="200" y1="15" x2="200" y2="165" stroke="#664431" strokeWidth="3" />
          <line x1="60" y1="90" x2="340" y2="90" stroke="#664431" strokeWidth="3" />

          {/* Правое окно */}
          <rect x="860" y="15" width="280" height="150" rx="4" fill="#38251B" stroke="#664431" strokeWidth="3" />
          <rect x="865" y="20" width="270" height="140" fill="url(#shojiGrid)" />
          <line x1="1000" y1="15" x2="1000" y2="165" stroke="#664431" strokeWidth="3" />
          <line x1="860" y1="90" x2="1140" y2="90" stroke="#664431" strokeWidth="3" />
        </g>

        {/* 3. ТЕПЛОЕ СВЕТОВОЕ ПЯТНО ОТ ФОНАРЯ */}
        <circle cx="600" cy="180" r="420" fill="url(#lampGlow)" />
        <circle cx="200" cy="120" r="300" fill="url(#windowSunlight)" />

        {/* 4. ВЕРХНЯЯ ЧАЙНАЯ ПОЛКА (Y = 175) — ЧЕТКО ВИДИМА И ОСВЕЩЕНА */}
        <g id="upper-tea-shelf">
          {/* Тень под полкой */}
          <rect x="40" y="196" width="1120" height="35" fill="url(#shelfDropShadow)" />

          {/* Полка из массива дуба */}
          <rect x="50" y="176" width="1100" height="20" rx="3" fill="url(#oakShelf)" />
          {/* Яркая освещенная верхняя фаска полки */}
          <rect x="50" y="176" width="1100" height="3.5" fill="url(#shelfTopRim)" />
          {/* Нижняя фаска */}
          <rect x="50" y="194" width="1100" height="2" fill="#24140B" />

          {/* Деревянные кронштейны */}
          <path d="M 160,196 L 176,196 L 160,238 Z" fill="#3E2517" />
          <path d="M 600,196 L 616,196 L 600,238 Z" fill="#3E2517" />
          <path d="M 1040,196 L 1024,196 L 1040,238 Z" fill="#3E2517" />

          {/* ПРЕДМЕТЫ НА ПОЛКЕ: */}

          {/* 4.1. Глиняный чайник Исин (Kyusu/Teapot) слева */}
          <g transform="translate(180, 95)" id="shelf-teapot">
            {/* Тень под чайником */}
            <ellipse cx="50" cy="80" rx="42" ry="5" fill="#140B07" opacity="0.65" />
            {/* Корпус чайника */}
            <path
              d="M 22,58 C 18,40 32,24 50,24 C 68,24 82,40 78,58 C 76,74 24,74 22,58 Z"
              fill="url(#terracottaClay)"
              stroke="#5A2316"
              strokeWidth="1.5"
            />
            {/* Крышечка с круглой ручкой */}
            <ellipse cx="50" cy="24" rx="18" ry="5" fill="#B8553D" stroke="#6B291A" strokeWidth="1" />
            <circle cx="50" cy="17" r="4.5" fill="#E2785F" stroke="#7A2E1E" strokeWidth="1" />
            {/* Носик чайника */}
            <path
              d="M 26,45 C 10,40 6,28 10,24 C 15,24 20,35 30,39 Z"
              fill="#943F2A"
              stroke="#5A2316"
              strokeWidth="1"
            />
            {/* Ручка чайника */}
            <path
              d="M 74,36 C 96,38 98,66 74,68"
              fill="none"
              stroke="#6E2C1D"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 74,36 C 96,38 98,66 74,68"
              fill="none"
              stroke="#D46A50"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            {/* Глянцевый световой блик */}
            <ellipse cx="44" cy="44" rx="16" ry="12" fill="#FFA58F" opacity="0.3" />
          </g>

          {/* 4.2. Стеклянная банка с янтарным облепиховым чаем */}
          <g transform="translate(300, 100)" id="shelf-citrus-jar">
            <ellipse cx="26" cy="76" rx="22" ry="4" fill="#140B07" opacity="0.55" />
            {/* Пробка из светлого дерева */}
            <rect x="14" y="6" width="24" height="10" rx="3" fill="#A8754F" stroke="#69452B" strokeWidth="1.5" />
            {/* Стеклянная банка */}
            <rect x="8" y="16" width="36" height="60" rx="5" fill="#FFFFFF" fillOpacity="0.08" stroke="#D1B39D" strokeWidth="1.5" strokeOpacity="0.6" />
            {/* Ярко-янтарное наполнение (облепиха / цитрус) */}
            <rect x="10" y="32" width="32" height="42" rx="3" fill="#F4A460" />
            <circle cx="18" cy="42" r="3.5" fill="#FFC982" />
            <circle cx="30" cy="50" r="4" fill="#E68A35" />
            <circle cx="22" cy="62" r="3.5" fill="#FFBA66" />
            {/* Блики стекла */}
            <line x1="13" y1="20" x2="13" y2="70" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            <line x1="38" y1="22" x2="38" y2="65" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
          </g>

          {/* 4.3. Стеклянная банка с рубиновым каркаде */}
          <g transform="translate(380, 106)" id="shelf-karkade-jar">
            <ellipse cx="24" cy="70" rx="20" ry="3.5" fill="#140B07" opacity="0.55" />
            <rect x="13" y="8" width="22" height="9" rx="2.5" fill="#8C5C3D" stroke="#57351F" strokeWidth="1.2" />
            <rect x="7" y="16" width="34" height="54" rx="4" fill="#FFFFFF" fillOpacity="0.08" stroke="#D1B39D" strokeWidth="1.5" strokeOpacity="0.6" />
            {/* Ярко-рубиновые лепестки каркаде */}
            <rect x="9" y="28" width="30" height="40" rx="3" fill="#B85B6C" />
            <circle cx="18" cy="40" r="3" fill="#D97587" />
            <circle cx="28" cy="52" r="3.5" fill="#913B4A" />
            <line x1="12" y1="20" x2="12" y2="64" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
          </g>

          {/* 4.4. Традиционная чаша для взбивания матчи (Тяван / Chawan) по центру */}
          <g transform="translate(500, 116)" id="shelf-chawan">
            <ellipse cx="44" cy="60" rx="38" ry="5" fill="#140B07" opacity="0.65" />
            {/* Керамическая чаша цвета селадон */}
            <path
              d="M 10,18 C 14,56 74,56 78,18 Z"
              fill="url(#celadonGlaze)"
              stroke="#36523B"
              strokeWidth="2"
            />
            {/* Венчик чаши с матчей внутри */}
            <ellipse cx="44" cy="18" rx="34" ry="7" fill="#4B6E52" stroke="#2B422F" strokeWidth="1.5" />
            <ellipse cx="44" cy="18" rx="30" ry="5.5" fill="#87A96B" />
            {/* Шелковистая пенка матчи */}
            <ellipse cx="44" cy="18" rx="25" ry="4" fill="#A1C485" opacity="0.8" />
            {/* Глянцевый блик чаши */}
            <path d="M 22,25 C 20,40 32,50 44,52" fill="none" stroke="#C2E0C7" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          </g>

          {/* 4.5. Бамбуковый венчик (Тясэн / Chasen) на подставке */}
          <g transform="translate(615, 112)" id="shelf-chasen">
            <ellipse cx="22" cy="64" rx="18" ry="3.5" fill="#140B07" opacity="0.5" />
            {/* Керамическая подставка для венчика */}
            <path d="M 10,48 C 10,64 34,64 34,48 C 34,38 10,38 10,48 Z" fill="url(#lavenderPot)" stroke="#4A4269" strokeWidth="1" />
            {/* Бамбуковая ручка */}
            <rect x="18" y="10" width="8" height="22" rx="2" fill="#E8CDA0" stroke="#B89B6A" strokeWidth="1.2" />
            <line x1="18" y1="18" x2="26" y2="18" stroke="#7A5D33" strokeWidth="1.5" />
            {/* Бамбуковые изогнутые струны */}
            <path d="M 14,32 C 6,42 12,56 22,56 C 32,56 38,42 30,32 Z" fill="#F5E4C4" stroke="#D1B37D" strokeWidth="1.2" />
            <line x1="22" y1="32" x2="22" y2="54" stroke="#B89B6A" strokeWidth="1" />
            <line x1="17" y1="34" x2="18" y2="52" stroke="#B89B6A" strokeWidth="1" />
            <line x1="27" y1="34" x2="26" y2="52" stroke="#B89B6A" strokeWidth="1" />
          </g>

          {/* 4.6. Банка с лавандовым чаем */}
          <g transform="translate(710, 102)" id="shelf-lavender-jar">
            <ellipse cx="24" cy="74" rx="20" ry="3.5" fill="#140B07" opacity="0.55" />
            <rect x="13" y="6" width="22" height="10" rx="3" fill="#A8754F" stroke="#69452B" strokeWidth="1.2" />
            <rect x="7" y="16" width="34" height="58" rx="4" fill="#FFFFFF" fillOpacity="0.08" stroke="#D1B39D" strokeWidth="1.5" strokeOpacity="0.6" />
            {/* Нежно-сиреневые цветки лаванды */}
            <rect x="9" y="30" width="30" height="42" rx="3" fill="#A29BFE" />
            <circle cx="16" cy="42" r="3.2" fill="#C4BFFF" />
            <circle cx="28" cy="52" r="3.5" fill="#7D74E6" />
            <circle cx="20" cy="62" r="3.2" fill="#B3ACFF" />
            <line x1="12" y1="20" x2="12" y2="68" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />
          </g>

          {/* 4.7. Стопка чайных пиал справа */}
          <g transform="translate(810, 122)" id="shelf-cups">
            <ellipse cx="32" cy="54" rx="26" ry="4" fill="#140B07" opacity="0.6" />
            {/* Нижняя пиала */}
            <path d="M 8,36 C 14,54 50,54 56,36 Z" fill="#B3937B" stroke="#7A5F4B" strokeWidth="1.5" />
            <ellipse cx="32" cy="36" rx="24" ry="4.5" fill="#CFB199" />
            {/* Средняя пиала (зеленая) */}
            <path d="M 11,26 C 16,42 48,42 53,26 Z" fill="#6B8E70" stroke="#46634A" strokeWidth="1.5" />
            <ellipse cx="32" cy="26" rx="21" ry="4" fill="#8EB394" />
            {/* Верхняя пиала (молочная) */}
            <path d="M 14,16 C 18,30 46,30 50,16 Z" fill="#E6C29F" stroke="#A88665" strokeWidth="1.5" />
            <ellipse cx="32" cy="16" rx="18" ry="3.5" fill="#FCE5CF" />
          </g>

          {/* 4.8. Керамический горшочек с веточкой чайного дерева (бонсай) */}
          <g transform="translate(930, 96)" id="shelf-plant">
            <ellipse cx="28" cy="80" rx="24" ry="4" fill="#140B07" opacity="0.55" />
            {/* Горшок */}
            <path d="M 12,50 L 16,78 L 40,78 L 44,50 Z" fill="#5A3A28" stroke="#362115" strokeWidth="1.5" />
            <ellipse cx="28" cy="50" rx="17" ry="4" fill="#784F39" />
            <ellipse cx="28" cy="50" rx="14" ry="3" fill="#2E1C12" />
            {/* Ствол бонсая */}
            <path d="M 28,50 Q 24,35 32,24 Q 38,15 34,5" fill="none" stroke="#4A3022" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M 28,32 Q 40,30 48,22" fill="none" stroke="#4A3022" strokeWidth="2.5" strokeLinecap="round" />
            {/* Зеленые чайные листочки */}
            <circle cx="34" cy="5" r="7" fill="#87A96B" />
            <circle cx="28" cy="8" r="6" fill="#A1C485" />
            <circle cx="48" cy="22" r="6.5" fill="#87A96B" />
            <circle cx="44" cy="18" r="5" fill="#A1C485" />
          </g>
        </g>

        {/* 5. ПОДВЕСНЫЕ ТРАВЯНЫЕ СБОРЫ (в углах) */}
        <g id="hanging-herbs" transform="translate(90, 0)">
          <line x1="20" y1="0" x2="20" y2="45" stroke="#8C6549" strokeWidth="1.5" strokeDasharray="3,2" />
          <g transform="translate(5, 42)">
            <path d="M 15,5 Q 4,28 0,48 M 15,5 Q 18,32 22,54 M 15,5 Q 28,28 32,48" stroke="#68804E" strokeWidth="2" fill="none" />
            <circle cx="0" cy="48" r="4.5" fill="#FFF2D6" stroke="#D1B87F" strokeWidth="0.8" />
            <circle cx="22" cy="54" r="5" fill="#FFF2D6" stroke="#D1B87F" strokeWidth="0.8" />
            <circle cx="32" cy="48" r="4.2" fill="#FFF2D6" stroke="#D1B87F" strokeWidth="0.8" />
            <circle cx="15" cy="32" r="3.8" fill="#F0C665" />
          </g>
        </g>

        {/* 6. КРАСИВЫЙ СВЕТЯЩИЙСЯ ЧАЙНЫЙ ФОНАРИК ПО ЦЕНТРУ */}
        <g id="tea-lamp" transform="translate(585, 0)">
          {/* Черный шнур */}
          <line x1="15" y1="0" x2="15" y2="40" stroke="#24140B" strokeWidth="2.5" />
          {/* Деревянная крышка */}
          <rect x="9" y="40" width="12" height="6" rx="1.5" fill="#5C3822" stroke="#362013" strokeWidth="1" />
          {/* Абажур из теплой светящейся рисовой бумаги с перекладинами */}
          <path d="M 1,46 L 29,46 L 38,76 L -8,76 Z" fill="#FFECC2" stroke="#6B4125" strokeWidth="1.5" />
          <line x1="7" y1="46" x2="1" y2="76" stroke="#8A5A38" strokeWidth="1" />
          <line x1="23" y1="46" x2="29" y2="76" stroke="#8A5A38" strokeWidth="1" />
          {/* Нижняя деревянная кромка */}
          <rect x="-9" y="76" width="48" height="5" rx="1.5" fill="#5C3822" />
          {/* Яркое золотистое свечение лампочки */}
          <ellipse cx="15" cy="80" rx="18" ry="6" fill="#FFA834" />
          <circle cx="15" cy="78" r="7" fill="#FFF6DE" />
          <circle cx="15" cy="82" r="38" fill="#FFB242" opacity="0.3" />
        </g>
      </svg>
    </div>
  );
};
