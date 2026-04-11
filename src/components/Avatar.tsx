import './Avatar.css';

interface AvatarProps {
  role: 'user' | 'assistant';
  seed?: string | null;
  size?: number;
  className?: string;
}

// Identicon 前景色：统一在靛蓝/紫色系，饱和度提升以呼应 brand-gradient
const USER_COLORS = [
  '#6366f1', // indigo-500 (brand)
  '#4f46e5', // indigo-600
  '#7c3aed', // violet-600
  '#5b21b6', // violet-800
];

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Identicon {
  color: string;
  cells: { x: number; y: number }[];
}

// 5×5 左右对称：仅哈希 3 列 (x=0,1,2)，x<2 的列镜像到 x=4-x
function buildIdenticon(seed: string): Identicon {
  const h = fnv1a(seed.trim() || '?');
  const color = USER_COLORS[(h >>> 20) % USER_COLORS.length];
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = (h >> (y * 3 + x)) & 1;
      if (on) {
        cells.push({ x, y });
        if (x < 2) cells.push({ x: 4 - x, y });
      }
    }
  }
  return { color, cells };
}

export default function Avatar({ role, seed, size = 36, className = '' }: AvatarProps) {
  const style = { width: size, height: size };

  if (role === 'assistant') {
    const iconSize = Math.round(size * 0.56);
    return (
      <div className={`cp-avatar cp-avatar-assistant ${className}`} style={style} aria-label="AI 助手">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2.5l1.6 5.7c.2.7.7 1.2 1.4 1.4l5.7 1.6-5.7 1.6c-.7.2-1.2.7-1.4 1.4L12 18l-1.6-5.3c-.2-.7-.7-1.2-1.4-1.4L3.3 9.7 9 8.1c.7-.2 1.2-.7 1.4-1.4L12 2.5z" />
          <circle cx="19" cy="5" r="1.4" />
          <circle cx="5.5" cy="18.5" r="1" />
        </svg>
        <span className="cp-avatar-glow" aria-hidden="true" />
      </div>
    );
  }

  // role === 'user'
  if (!seed) {
    const fontSize = Math.round(size * 0.42);
    return (
      <div
        className={`cp-avatar cp-avatar-user cp-avatar-anon ${className}`}
        style={style}
        aria-label="未登录用户"
      >
        <span className="cp-avatar-initial" style={{ fontSize }}>
          ?
        </span>
      </div>
    );
  }

  const { color, cells } = buildIdenticon(seed);

  return (
    <div
      className={`cp-avatar cp-avatar-user ${className}`}
      style={style}
      aria-label={`用户 ${seed}`}
      title={seed}
    >
      <svg
        className="cp-avatar-identicon"
        viewBox="0 0 5 5"
        width="64%"
        height="64%"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {cells.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width="1" height="1" fill={color} />
        ))}
      </svg>
    </div>
  );
}
