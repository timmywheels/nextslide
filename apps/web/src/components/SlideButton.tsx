import { useRef, useState, type MouseEvent } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import './slide-button.css'

interface Props {
  direction: 'next' | 'prev'
  label: string
  className: string
  iconSize: number
  strokeWidth?: number
  disabled?: boolean
  /** Presses are ignored while busy, without dimming the button, so a quick double tap never flickers. */
  busy?: boolean
  onPress: () => void
}

interface Ripple { id: number; x: number; y: number; size: number }

/** The speaker's slide button. The marketing demo uses this too, so it feels exactly like the real remote. */
export function SlideButton({ direction, label, className, iconSize, strokeWidth, disabled, busy, onPress }: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [presses, setPresses] = useState(0)
  const nextRipple = useRef(0)
  const Arrow = direction === 'next' ? ArrowRight : ArrowLeft

  function press(event: MouseEvent<HTMLButtonElement>) {
    if (busy) return
    onPress()
    const box = event.currentTarget.getBoundingClientRect()
    // Keyboard clicks report detail 0 and have no pointer position, so they bloom from the center.
    const x = event.detail > 0 ? event.clientX - box.left : box.width / 2
    const y = event.detail > 0 ? event.clientY - box.top : box.height / 2
    const size = 2 * Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y))
    setRipples(current => [...current, { id: nextRipple.current++, x, y, size }])
    setPresses(count => count + 1)
    navigator.vibrate?.(8)
  }

  return (
    <button type="button" className={`slide-button slide-button-${direction} ${className}`} aria-busy={busy} disabled={disabled} onClick={press}>
      {ripples.map(({ id, x, y, size }) => (
        <span
          key={id}
          className="slide-ripple"
          aria-hidden="true"
          style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
          onAnimationEnd={() => setRipples(current => current.filter(ripple => ripple.id !== id))}
        />
      ))}
      <span className="slide-icon" aria-hidden="true">
        <Arrow key={presses} className={presses ? 'is-traveling' : undefined} size={iconSize} strokeWidth={strokeWidth} />
      </span>
      <span className="slide-label">{label}</span>
    </button>
  )
}
