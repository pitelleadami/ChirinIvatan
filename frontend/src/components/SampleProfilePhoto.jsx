import sampleProfileSprite from '../assets/profile-samples/sample-profile-sprite.png'

const COLUMNS = 4
const ROWS = 3

export default function SampleProfilePhoto({ className = '', index = 0 }) {
  const safeIndex = Math.abs(Number(index) || 0) % (COLUMNS * ROWS)
  const column = safeIndex % COLUMNS
  const row = Math.floor(safeIndex / COLUMNS)
  const x = COLUMNS === 1 ? 0 : (column / (COLUMNS - 1)) * 100
  const y = ROWS === 1 ? 0 : (row / (ROWS - 1)) * 100

  return (
    <span
      className={`sample-profile-photo ${className}`.trim()}
      style={{
        backgroundImage: `url(${sampleProfileSprite})`,
        backgroundPosition: `${x}% ${y}%`,
      }}
      aria-hidden="true"
    />
  )
}
