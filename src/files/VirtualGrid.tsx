import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Cell, Rules } from '../lib/contracts'
import { cellKey } from '../lib/contracts'
import { integer } from './query'
import { TileStore } from './tiles'

export const CELL = 36
interface Props {
  store: TileStore
  rules: Rules
  selected: Set<string>
  disabled: boolean
  onSelect: (cell: Cell) => void
  onCursor: (cell: Cell) => void
  onDrag: (event: React.DragEvent) => void
  onPointer: (event: React.PointerEvent) => void
  overlay?: ReactNode
}
export const VirtualGrid = memo(function VirtualGrid({
  store,
  rules,
  selected,
  disabled,
  onSelect,
  onCursor,
  onDrag,
  onPointer,
  overlay,
}: Props) {
  useSyncExternalStore(store.subscribe, store.snapshot)
  const [params, setParams] = useSearchParams()
  const element = useRef<HTMLDivElement>(null)
  const file = store.file
  const [position, setPosition] = useState(() => ({
    r: integer(params.get('r'), 0, file.rows - 1),
    c: integer(params.get('c'), 0, file.cols - 1),
  }))
  const [focus, setFocus] = useState<Cell>(position)
  const [size, setSize] = useState({ width: 720, height: 500 })
  const lastWritten = useRef('')
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const frame = useRef(0)
  const focusRequested = useRef(false)
  const queryPosition = `${params.get('r') ?? '0'}:${params.get('c') ?? '0'}`
  useLayoutEffect(() => {
    if (lastWritten.current === queryPosition) return
    const r = integer(params.get('r'), 0, file.rows - 1),
      c = integer(params.get('c'), 0, file.cols - 1)
    element.current?.scrollTo({ top: r * CELL, left: c * CELL })
    setPosition({ r, c })
    setFocus({ r, c })
  }, [queryPosition, file.rows, file.cols, params])
  useEffect(() => {
    const node = element.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setSize({ width: node.clientWidth, height: node.clientHeight }),
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      clearTimeout(scrollTimer.current)
      cancelAnimationFrame(frame.current)
    }
  }, [])
  const startR = Math.max(0, position.r - 2),
    startC = Math.max(0, position.c - 2)
  // Container dimensions are capped too: even extreme zoom/viewport sizes cannot exceed the budget.
  const endR = Math.min(file.rows, startR + Math.min(46, Math.ceil(size.height / CELL) + 5))
  const endC = Math.min(file.cols, startC + Math.min(50, Math.ceil(size.width / CELL) + 5))
  const tileKeys = new Set<string>()
  for (let r = startR; r < endR; r++)
    for (let c = startC; c < endC; c++) tileKeys.add(store.key(r, c))
  tileKeys.add(store.key(focus.r, focus.c))
  const tileSignature = [...tileKeys].sort().join(',')
  useEffect(() => {
    store.viewport(new Set(tileSignature.split(',')))
  }, [store, tileSignature])
  useEffect(() => () => store.viewport(new Set()), [store])
  useLayoutEffect(() => {
    if (focusRequested.current) {
      element.current
        ?.querySelector<HTMLElement>(`[data-cell="${cellKey(focus)}"]`)
        ?.focus({ preventScroll: true })
      focusRequested.current = false
    }
  }, [focus, position])
  function move(event: KeyboardEvent, cell: Cell) {
    let { r, c } = cell
    switch (event.key) {
      case 'ArrowUp':
        r--
        break
      case 'ArrowDown':
        r++
        break
      case 'ArrowLeft':
        c--
        break
      case 'ArrowRight':
        c++
        break
      case 'PageUp':
        r -= Math.max(1, Math.floor(size.height / CELL) - 1)
        break
      case 'PageDown':
        r += Math.max(1, Math.floor(size.height / CELL) - 1)
        break
      case 'Home':
        c = 0
        if (event.ctrlKey) r = 0
        break
      case 'End':
        c = file.cols - 1
        if (event.ctrlKey) r = file.rows - 1
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!disabled) onSelect(cell)
        return
      default:
        return
    }
    event.preventDefault()
    r = Math.max(0, Math.min(file.rows - 1, r))
    c = Math.max(0, Math.min(file.cols - 1, c))
    focusRequested.current = true
    setFocus({ r, c })
    onCursor({ r, c })
    const node = element.current
    if (node) {
      if (r * CELL < node.scrollTop) node.scrollTop = r * CELL
      else if ((r + 1) * CELL > node.scrollTop + node.clientHeight)
        node.scrollTop = (r + 1) * CELL - node.clientHeight
      if (c * CELL < node.scrollLeft) node.scrollLeft = c * CELL
      else if ((c + 1) * CELL > node.scrollLeft + node.clientWidth)
        node.scrollLeft = (c + 1) * CELL - node.clientWidth
      setPosition({ r: Math.floor(node.scrollTop / CELL), c: Math.floor(node.scrollLeft / CELL) })
    }
  }
  function renderCell(r: number, c: number) {
    const cell = { r, c },
      key = cellKey(cell),
      data = store.cell(r, c)
    const scary = data && data.bin === '.' && data.tremor >= rules.tremorThreshold
    const isSelected = selected.has(key)
    return (
      <div
        key={key}
        role="gridcell"
        aria-colindex={c + 1}
        aria-selected={isSelected}
        aria-disabled={disabled || !data || data.bin !== '.'}
        tabIndex={focus.r === r && focus.c === c ? 0 : -1}
        data-cell={key}
        className={`mdr-cell ${scary ? 'scary' : ''} ${isSelected ? 'selected' : ''} ${data && data.bin !== '.' ? 'refined' : ''}`}
        style={
          {
            left: c * CELL,
            '--tremor-time': `${1.1 - (data?.tremor ?? 0) / 130}s`,
          } as CSSProperties
        }
        aria-label={`Fila ${r + 1}, columna ${c + 1}: ${data ? `${data.value}, temblor ${data.tremor}${data.bin !== '.' ? `, refinada ${data.bin}` : scary ? ', da miedo' : ''}` : 'cargando'}`}
        draggable={isSelected && !disabled}
        onDragStart={onDrag}
        onPointerDown={isSelected && !disabled ? onPointer : undefined}
        onFocus={() => {
          setFocus(cell)
          onCursor(cell)
        }}
        onPointerEnter={() => onCursor(cell)}
        onClick={() => {
          setFocus(cell)
          if (!disabled) onSelect(cell)
        }}
        onKeyDown={(event) => move(event, cell)}
      >
        {data ? (
          <span>{data.bin === '.' ? data.value : data.bin}</span>
        ) : (
          <span aria-hidden="true" className="placeholder">
            ·
          </span>
        )}
      </div>
    )
  }
  const rowNumbers = Array.from({ length: endR - startR }, (_, i) => i + startR)
  if (focus.r < startR || focus.r >= endR) rowNumbers.push(focus.r)
  return (
    <>
      <p id="grid-help" className="text-sm my-3">
        Flechas, Inicio/Fin y RePág/AvPág: navegar. Enter: seleccionar grupo. Tab: ir a las cajas.
        Escape: cancelar.
      </p>
      <div
        ref={element}
        className="mdr-viewport"
        role="grid"
        aria-label={`Macrodatos ${file.name}`}
        aria-describedby="grid-help"
        aria-rowcount={file.rows}
        aria-colcount={file.cols}
        onScroll={() => {
          if (frame.current) return
          frame.current = requestAnimationFrame(() => {
            frame.current = 0
            const node = element.current
            if (!node) return
            const r = Math.floor(node.scrollTop / CELL),
              c = Math.floor(node.scrollLeft / CELL)
            setPosition({ r, c })
            clearTimeout(scrollTimer.current)
            scrollTimer.current = setTimeout(() => {
              lastWritten.current = `${r}:${c}`
              setParams(
                (previous) => {
                  const next = new URLSearchParams(previous)
                  next.set('r', String(r))
                  next.set('c', String(c))
                  return next
                },
                { replace: true },
              )
            }, 120)
          })
        }}
      >
        <div style={{ width: file.cols * CELL, height: file.rows * CELL, position: 'relative' }}>
          {rowNumbers
            .sort((a, b) => a - b)
            .map((r) => (
              <div
                key={r}
                role="row"
                aria-rowindex={r + 1}
                style={{ position: 'absolute', top: r * CELL, height: CELL, width: '100%' }}
              >
                {r >= startR &&
                  r < endR &&
                  Array.from({ length: endC - startC }, (_, i) => renderCell(r, startC + i))}
                {r === focus.r &&
                  (r < startR || r >= endR || focus.c < startC || focus.c >= endC) &&
                  renderCell(focus.r, focus.c)}
              </div>
            ))}
          {overlay}
        </div>
      </div>
      {store.errors.size > 0 && (
        <div role="alert">
          No se pudieron cargar algunos bloques.{' '}
          <button onClick={() => store.retry()}>Reintentar bloques</button>
        </div>
      )}
    </>
  )
})
