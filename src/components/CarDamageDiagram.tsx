import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Dict } from '../i18n'
import type { ContractDamage } from '../utils/contracts'
import { DAMAGE_TYPES, createDamageAt, inferDamagePartFromPosition, normalizeDamage } from '../utils/contracts'

type CarDamageDiagramProps = {
  damages: ContractDamage[]
  onChange?: (damages: ContractDamage[]) => void
  t: Dict
  readOnly?: boolean
}

const DAMAGE_COLORS: Record<string, string> = {
  R: '#dc2626',
  B: '#f59e0b',
  E: '#2563eb',
  C: '#7c3aed',
}

type PendingClick = {
  x: number   // percent on diagram
  y: number
  px: number  // screen pixels for popup positioning
  py: number
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

function pointerToPercent(clientX: number, clientY: number, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    x: clampPercent(((clientX - rect.left) / rect.width) * 100),
    y: clampPercent(((clientY - rect.top) / rect.height) * 100),
    // pixel offset relative to stage for popup placement
    px: clientX - rect.left,
    py: clientY - rect.top,
  }
}

function DiagramSvg() {
  return (
    <img
      src="./car-diagram.png"
      alt="Car Diagram"
      className="car-damage-diagram-svg"
      draggable={false}
    />
  )
}

export function CarDamageDiagramInner({ damages, onChange, t, readOnly = false }: CarDamageDiagramProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [pending, setPending] = useState<PendingClick | null>(null)
  const [pickerStyle, setPickerStyle] = useState<CSSProperties>({})
  const damagesRef = useRef(damages)
  const dragRafRef = useRef<number | null>(null)
  damagesRef.current = damages

  // Close popup on outside click
  useEffect(() => {
    if (!pending) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.damage-type-picker')) setPending(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [pending])

  useLayoutEffect(() => {
    if (!pending || !stageRef.current) return

    const stageRect = stageRef.current.getBoundingClientRect()
    const pickerW = 190
    const pickerH = 170
    const margin = 10
    const anchorX = stageRect.left + pending.px
    const anchorY = stageRect.top + pending.py

    let transform = 'translate(-50%, calc(-100% - 10px))'
    if (anchorY - pickerH < margin) {
      transform = 'translate(-50%, 12px)'
    }

    const left = Math.max(margin + pickerW / 2, Math.min(window.innerWidth - margin - pickerW / 2, anchorX))

    setPickerStyle({
      position: 'fixed',
      left,
      top: anchorY,
      transform,
      zIndex: 1200,
    })
  }, [pending])

  // Drag pointermove / pointerup
  useEffect(() => {
    if (!draggingId || !onChange) return

    const onPointerMove = (event: PointerEvent) => {
      const stage = stageRef.current
      if (!stage) return
      const pos = pointerToPercent(event.clientX, event.clientY, stage)
      if (dragRafRef.current != null) return
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null
        setDragPos(pos)
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      if (dragRafRef.current != null) {
        window.cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
      const stage = stageRef.current
      if (stage) {
        const { x, y } = pointerToPercent(event.clientX, event.clientY, stage)
        onChange(
          damagesRef.current.map((damage) =>
            damage.id === draggingId
              ? normalizeDamage({ ...damage, x, y, part: inferDamagePartFromPosition(x, y) })
              : damage,
          ),
        )
      }
      setDraggingId(null)
      setDragPos(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [draggingId, onChange])

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (readOnly || !onChange) return
    const stage = stageRef.current
    if (!stage) return
    const { x, y, px, py } = pointerToPercent(event.clientX, event.clientY, stage)
    setPending({ x, y, px, py })
  }

  const confirmType = (type: string) => {
    if (!pending || !onChange) return
    const damage = createDamageAt(pending.x, pending.y)
    onChange([...damagesRef.current, { ...damage, type }])
    setPending(null)
  }

  return (
    <div className="car-damage-diagram">
      <div className="car-damage-diagram-header">
        <span className="vehicle-state-damages-label">{t.carStateDiagram}</span>
        {!readOnly ? <span className="muted-text">{t.carStateDiagramHint}</span> : null}
      </div>

      <div
        ref={stageRef}
        className={`car-damage-diagram-stage${readOnly ? ' is-readonly' : ''}`}
        onClick={handleStageClick}
      >
        <DiagramSvg />

        {/* pending click crosshair */}
        {pending && (
          <div
            className="damage-pending-dot"
            style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
          />
        )}

        {/* existing markers */}
        {damages.map((rawDamage, index) => {
          const damage = normalizeDamage(rawDamage)
          const color = DAMAGE_COLORS[damage.type] || '#dc2626'
          const isDragging = damage.id === draggingId
          const left = isDragging && dragPos ? dragPos.x : (damage.x ?? 50)
          const top = isDragging && dragPos ? dragPos.y : (damage.y ?? 50)
          return (
            <button
              key={damage.id || `${damage.part}-${index}`}
              type="button"
              className="car-damage-marker"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                background: color,
                cursor: readOnly ? 'default' : isDragging ? 'grabbing' : 'grab',
              }}
              title={`${damage.type}. ${t[`part_${damage.part}` as keyof Dict] || damage.part}`}
              onPointerDown={(event) => {
                if (readOnly || !onChange) return
                event.preventDefault()
                event.stopPropagation()
                setPending(null)
                setDraggingId(damage.id || null)
                setDragPos({ x: damage.x ?? 50, y: damage.y ?? 50 })
              }}
              onClick={(event) => event.stopPropagation()}
              disabled={readOnly}
            >
              {damage.type || '?'}
            </button>
          )
        })}
      </div>

      {pending
        ? createPortal(
            <div
              className="damage-type-picker"
              style={pickerStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="damage-type-picker-label">{t.damageType}</p>
              <div className="damage-type-picker-options">
                {DAMAGE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="damage-type-picker-btn"
                    style={{ background: DAMAGE_COLORS[type] }}
                    onClick={() => confirmType(type)}
                  >
                    <span className="damage-type-picker-letter">{type}</span>
                    <span className="damage-type-picker-name">
                      {t[`damage_${type}` as keyof Dict] || type}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="damage-type-picker-cancel"
                onClick={() => setPending(null)}
              >
                ✕
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export const CarDamageDiagram = memo(CarDamageDiagramInner)
