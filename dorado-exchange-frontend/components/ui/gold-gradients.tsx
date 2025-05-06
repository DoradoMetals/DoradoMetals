export default function GlobalGradients() {
  return (
    <svg className="absolute w-0 h-0 pointer-events-none">
      <defs>
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#AE8625" />
          <stop offset="25%" stopColor="#F5D67D" />
          <stop offset="50%" stopColor="#D2AC47" />
          <stop offset="75%" stopColor="#EDC967" />
          <stop offset="100%" stopColor="#AE8625" />
        </linearGradient>
      </defs>
    </svg>
  )
}