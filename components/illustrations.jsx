// Hand-drawn placeholder illustrations — one per topic (dashboard, mobile app,
// analytics, etc.) so every media slot has something relevant to look at
// before you swap in real screenshots. They use `currentColor` so they pick
// up whatever tone (light/accent/dark) the surrounding MediaFrame is set to.
// Replace any of these any time by passing an `image` in data/content.js —
// that always takes priority over the illustration.

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ className, children }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 300"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  );
}

export function DashboardIllustration({ className }) {
  return (
    <Svg className={className}>
      <rect x="40" y="40" width="320" height="220" rx="14" {...common} />
      <circle cx="62" cy="58" r="3" fill="currentColor" stroke="none" />
      <circle cx="76" cy="58" r="3" fill="currentColor" stroke="none" />
      <circle cx="90" cy="58" r="3" fill="currentColor" stroke="none" />
      <line x1="40" y1="72" x2="360" y2="72" {...common} strokeWidth="1" opacity="0.4" />
      <line x1="120" y1="72" x2="120" y2="260" {...common} strokeWidth="1" opacity="0.4" />
      <line x1="64" y1="98" x2="98" y2="98" {...common} />
      <line x1="64" y1="120" x2="98" y2="120" {...common} opacity="0.6" />
      <line x1="64" y1="142" x2="98" y2="142" {...common} opacity="0.6" />
      <line x1="64" y1="164" x2="98" y2="164" {...common} opacity="0.6" />
      <rect x="140" y="90" width="56" height="34" rx="6" {...common} />
      <rect x="206" y="90" width="56" height="34" rx="6" {...common} />
      <rect x="272" y="90" width="56" height="34" rx="6" {...common} />
      <line x1="140" y1="240" x2="328" y2="240" {...common} strokeWidth="1" opacity="0.4" />
      <rect x="145" y="205" width="14" height="35" rx="2" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="167" y="185" width="14" height="55" rx="2" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="189" y="165" width="14" height="75" rx="2" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="211" y="195" width="14" height="45" rx="2" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="233" y="150" width="14" height="90" rx="2" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="255" y="175" width="14" height="65" rx="2" fill="currentColor" opacity="0.18" stroke="none" />
    </Svg>
  );
}

export function MobileAppIllustration({ className }) {
  return (
    <Svg className={className}>
      <rect x="150" y="30" width="100" height="240" rx="20" {...common} />
      <rect x="184" y="42" width="32" height="6" rx="3" fill="currentColor" opacity="0.5" stroke="none" />
      <line x1="165" y1="72" x2="220" y2="72" {...common} />
      <rect x="165" y="92" width="70" height="24" rx="6" {...common} opacity="0.85" />
      <rect x="165" y="124" width="70" height="24" rx="6" {...common} opacity="0.85" />
      <rect x="165" y="156" width="70" height="24" rx="6" {...common} opacity="0.85" />
      <line x1="188" y1="254" x2="212" y2="254" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <circle cx="222" cy="196" r="15" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.6" />
      <line x1="222" y1="190" x2="222" y2="202" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="216" y1="196" x2="228" y2="196" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export function AnalyticsIllustration({ className }) {
  return (
    <Svg className={className}>
      <line x1="60" y1="50" x2="60" y2="240" {...common} opacity="0.5" />
      <line x1="60" y1="240" x2="340" y2="240" {...common} opacity="0.5" />
      <line x1="60" y1="190" x2="340" y2="190" strokeDasharray="2 8" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <line x1="60" y1="140" x2="340" y2="140" strokeDasharray="2 8" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <line x1="60" y1="90" x2="340" y2="90" strokeDasharray="2 8" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <polyline
        points="70,215 120,195 170,205 220,150 270,120 330,70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="70" cy="215" r="4" fill="currentColor" stroke="none" />
      <circle cx="120" cy="195" r="4" fill="currentColor" stroke="none" />
      <circle cx="170" cy="205" r="4" fill="currentColor" stroke="none" />
      <circle cx="220" cy="150" r="4" fill="currentColor" stroke="none" />
      <circle cx="270" cy="120" r="4" fill="currentColor" stroke="none" />
      <circle cx="330" cy="70" r="5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function StrategyIllustration({ className }) {
  return (
    <Svg className={className}>
      <path
        d="M70,170 Q115,105 160,120 T250,170 T340,110"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="1 9"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="70" cy="170" r="15" {...common} />
      <path d="M63,170 l5,6 l10,-12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="160" cy="120" r="15" {...common} />
      <circle cx="250" cy="170" r="15" {...common} />
      <circle cx="340" cy="110" r="20" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.6" />
    </Svg>
  );
}

export function CodeIllustration({ className }) {
  return (
    <Svg className={className}>
      <rect x="40" y="40" width="320" height="220" rx="12" {...common} />
      <circle cx="60" cy="58" r="3" fill="currentColor" stroke="none" />
      <circle cx="74" cy="58" r="3" fill="currentColor" stroke="none" />
      <circle cx="88" cy="58" r="3" fill="currentColor" stroke="none" />
      <line x1="40" y1="72" x2="360" y2="72" {...common} strokeWidth="1" opacity="0.4" />
      <line x1="64" y1="96" x2="176" y2="96" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="88" y1="120" x2="220" y2="120" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <line x1="112" y1="144" x2="168" y2="144" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <line x1="112" y1="168" x2="252" y2="168" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <line x1="88" y1="192" x2="140" y2="192" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <line x1="64" y1="216" x2="228" y2="216" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="88" y1="240" x2="296" y2="240" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </Svg>
  );
}

export function MarketingIllustration({ className }) {
  return (
    <Svg className={className}>
      <path
        d="M90,140 L215,108 L215,192 L90,160 Z"
        {...common}
        strokeLinejoin="round"
      />
      <rect x="70" y="140" width="20" height="20" rx="3" {...common} />
      <line x1="80" y1="160" x2="80" y2="182" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M235,115 Q270,150 235,185" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M258,98 Q305,150 258,202" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M281,82 Q340,150 281,218" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.45" />
      <circle cx="320" cy="80" r="4" fill="currentColor" opacity="0.5" stroke="none" />
      <circle cx="335" cy="100" r="3" fill="currentColor" opacity="0.4" stroke="none" />
      <circle cx="315" cy="105" r="2.5" fill="currentColor" opacity="0.4" stroke="none" />
    </Svg>
  );
}

export function SeoIllustration({ className }) {
  return (
    <Svg className={className}>
      <polyline
        points="50,230 120,200 170,140 220,160 280,110 340,70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="170" cy="140" r="42" {...common} strokeWidth="2" />
      <line x1="200" y1="170" x2="238" y2="208" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  );
}

export function KanbanIllustration({ className }) {
  return (
    <Svg className={className}>
      <line x1="150" y1="50" x2="150" y2="260" {...common} strokeWidth="1" opacity="0.4" />
      <line x1="270" y1="50" x2="270" y2="260" {...common} strokeWidth="1" opacity="0.4" />
      <line x1="55" y1="65" x2="110" y2="65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="175" y1="65" x2="230" y2="65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="295" y1="65" x2="345" y2="65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="45" y="86" width="90" height="36" rx="7" {...common} />
      <rect x="45" y="132" width="90" height="36" rx="7" {...common} opacity="0.7" />
      <rect x="45" y="178" width="90" height="26" rx="7" {...common} opacity="0.5" />
      <rect x="165" y="86" width="90" height="30" rx="7" {...common} />
      <rect x="165" y="126" width="90" height="46" rx="7" {...common} opacity="0.7" />
      <rect x="285" y="86" width="70" height="36" rx="7" {...common} />
    </Svg>
  );
}

export function BillingIllustration({ className }) {
  return (
    <Svg className={className}>
      <circle cx="115" cy="150" r="55" stroke="currentColor" strokeWidth="16" fill="none" opacity="0.15" />
      <circle
        cx="115"
        cy="150"
        r="55"
        stroke="currentColor"
        strokeWidth="16"
        fill="none"
        strokeDasharray="220 345"
        strokeLinecap="round"
        transform="rotate(-90 115 150)"
      />
      <line x1="225" y1="240" x2="360" y2="240" {...common} strokeWidth="1" opacity="0.4" />
      <rect x="230" y="205" width="14" height="35" rx="2" fill="currentColor" opacity="0.2" stroke="none" />
      <rect x="252" y="185" width="14" height="55" rx="2" fill="currentColor" opacity="0.2" stroke="none" />
      <rect x="274" y="165" width="14" height="75" rx="2" fill="currentColor" opacity="0.2" stroke="none" />
      <rect x="296" y="195" width="14" height="45" rx="2" fill="currentColor" opacity="0.2" stroke="none" />
      <rect x="318" y="150" width="14" height="90" rx="2" fill="currentColor" opacity="0.2" stroke="none" />
    </Svg>
  );
}

export function InboxIllustration({ className }) {
  return (
    <Svg className={className}>
      <circle cx="72" cy="80" r="18" {...common} />
      <line x1="102" y1="72" x2="220" y2="72" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="102" y1="90" x2="260" y2="90" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
      <circle cx="345" cy="72" r="5" fill="currentColor" stroke="none" />
      <line x1="40" y1="112" x2="360" y2="112" stroke="currentColor" strokeWidth="1" opacity="0.2" />

      <circle cx="72" cy="150" r="18" {...common} opacity="0.85" />
      <line x1="102" y1="142" x2="200" y2="142" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      <line x1="102" y1="160" x2="240" y2="160" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
      <line x1="40" y1="182" x2="360" y2="182" stroke="currentColor" strokeWidth="1" opacity="0.2" />

      <circle cx="72" cy="220" r="18" {...common} opacity="0.7" />
      <line x1="102" y1="212" x2="230" y2="212" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
      <line x1="102" y1="230" x2="270" y2="230" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.35" />
    </Svg>
  );
}

export function LandingIllustration({ className }) {
  return (
    <Svg className={className}>
      <rect x="40" y="40" width="320" height="220" rx="14" {...common} />
      <circle cx="62" cy="58" r="3" fill="currentColor" stroke="none" />
      <circle cx="76" cy="58" r="3" fill="currentColor" stroke="none" />
      <circle cx="90" cy="58" r="3" fill="currentColor" stroke="none" />
      <line x1="40" y1="72" x2="360" y2="72" {...common} strokeWidth="1" opacity="0.4" />

      <rect x="120" y="98" width="160" height="14" rx="7" fill="currentColor" opacity="0.85" stroke="none" />
      <rect x="150" y="122" width="100" height="8" rx="4" fill="currentColor" opacity="0.4" stroke="none" />
      <rect x="160" y="148" width="80" height="26" rx="13" {...common} />

      <rect x="110" y="200" width="140" height="28" rx="6" {...common} opacity="0.7" />
      <rect x="258" y="200" width="60" height="28" rx="6" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="1.6" />
    </Svg>
  );
}
