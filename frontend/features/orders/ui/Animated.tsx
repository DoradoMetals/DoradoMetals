// AnimatedHandshake lived here until the wave-2 dead-code pass: zero
// importers - it animated the offer handshake, and offers are gone (086).
export const AnimatedScroll: React.FC<{
  size?: number
  height?: number
  className?: string
  stroke?: string
  color?: string
}> = ({ size = 50, height, className = '', stroke, color = '', ...props }) => (
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
      className="scroll-1 scroll-2"
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
