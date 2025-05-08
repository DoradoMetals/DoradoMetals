export default function GlobalGradients() {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="absolute w-1 h-1 pointer-events-none overflow-visible"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id="goldGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#AE8625" />
            <stop offset="25%" stopColor="#F5D67D" />
            <stop offset="50%" stopColor="#D2AC47" />
            <stop offset="75%" stopColor="#EDC967" />
            <stop offset="100%" stopColor="#AE8625" />
          </linearGradient>
        </defs>
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="absolute w-1 h-1 pointer-events-none overflow-visible"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="goldGradientCustom" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#AE8625" />
            <stop offset="25%" stopColor="#F5D67D" />
            <stop offset="50%" stopColor="#D2AC47" />
            <stop offset="75%" stopColor="#EDC967" />
            <stop offset="100%" stopColor="#AE8625" />
          </linearGradient>
        </defs>
      </svg>
    </>
  )
}
