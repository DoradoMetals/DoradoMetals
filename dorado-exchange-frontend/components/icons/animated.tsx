import getPrimaryIconStroke from "@/utils/getPrimaryIconStroke"

export const AnimatedHandshake: React.FC<{
  size?: number
  height?: number
  className?: string
  stroke?: string
}> = ({ size = 50, height, className = '', stroke, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m11 17 2 2a1 1 0 1 0 3-3" className="handshake-1"></path>
    <path
      d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"
      className="handshake-2"
    ></path>
    <path d="m21 3 1 11h-2" className="handshake-3"></path>
    <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" className="handshake-4"></path>
    <path d="M3 4h8" className="handshake-5"></path>
  </svg>
)

export const AnimatedScroll: React.FC<{
  size?: number
  height?: number
  className?: string
  stroke?: string
  color?: string
}> = ({ size = 50, height, className = '', stroke, color, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    className={className}
    viewBox="0 0 256 256"
    fill={stroke}
    stroke={stroke}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    color={color}
  >
    <path
      d="M200,176V64a24,24,0,0,0-24-24H40"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
      className="scroll-2"
    ></path>
    <line
      x1="104"
      y1="104"
      x2="168"
      y2="104"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
      className="scroll-3"
    ></line>
    <line
      x1="104"
      y1="136"
      x2="168"
      y2="136"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
      className="scroll-4"
    ></line>
    <path
      d="M24,80s-8-6-8-16a24,24,0,0,1,48,0V192a24,24,0,0,0,48,0c0-10-8-16-8-16H216s8,6,8,16a24,24,0,0,1-24,24H88"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
      className="scroll-5"
    ></path>
  </svg>
)
