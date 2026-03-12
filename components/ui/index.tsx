'use client'

import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import Link from 'next/link'
import { c, font, radius, btnPrimary, btnSecondary, card, cardElevated, inputStyle } from '@/app/design'

// ─── BtrButton ──────────────────────────────────────────────

type BtrButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type BtrButtonSize = 'sm' | 'md' | 'lg'

interface BtrButtonProps {
  variant?: BtrButtonVariant
  size?: BtrButtonSize
  loading?: boolean
  disabled?: boolean
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void
  href?: string
  className?: string
  style?: CSSProperties
  type?: 'button' | 'submit' | 'reset'
}

const sizeMap: Record<BtrButtonSize, CSSProperties> = {
  sm: { fontSize: 12, padding: '6px 14px', borderRadius: radius.sm },
  md: { fontSize: 14, padding: '10px 20px', borderRadius: radius.md },
  lg: { fontSize: 16, padding: '14px 28px', borderRadius: radius.lg },
}

const variantMap: Record<BtrButtonVariant, CSSProperties> = {
  primary: {
    ...btnPrimary,
    color: c.bg,
    background: c.pink,
  },
  secondary: {
    ...btnSecondary,
    color: c.text2,
    background: c.surface,
    border: `1px solid ${c.border}`,
  },
  danger: {
    fontFamily: font.sans,
    fontWeight: 600,
    color: '#FFF',
    background: c.red,
    border: 'none',
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: 'all .2s cubic-bezier(.25,.1,.25,1)',
  },
  ghost: {
    fontFamily: font.sans,
    fontWeight: 500,
    color: c.text2,
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: 'all .2s cubic-bezier(.25,.1,.25,1)',
  },
}

const variantHoverClass: Record<BtrButtonVariant, string> = {
  primary: 'btn-p',
  secondary: 'btn-s',
  danger: '',
  ghost: '',
}

export const BtrButton = forwardRef<HTMLButtonElement, BtrButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, onClick, href, className, style, type = 'button' }, ref) => {
    const merged: CSSProperties = {
      ...variantMap[variant],
      ...sizeMap[size],
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      textDecoration: 'none',
      lineHeight: 1,
      opacity: disabled || loading ? 0.5 : 1,
      pointerEvents: disabled || loading ? 'none' : 'auto',
      ...style,
    }

    const hoverClass = [variantHoverClass[variant], className].filter(Boolean).join(' ') || undefined

    if (href && !disabled) {
      return (
        <Link href={href} style={merged} className={hoverClass} onClick={onClick as any}>
          {loading && <BtrSpinner size={size === 'sm' ? 12 : 14} />}
          {children}
        </Link>
      )
    }

    return (
      <button ref={ref} type={type} style={merged} className={hoverClass} disabled={disabled || loading} onClick={onClick as any}>
        {loading && <BtrSpinner size={size === 'sm' ? 12 : 14} />}
        {children}
      </button>
    )
  }
)
BtrButton.displayName = 'BtrButton'

// tiny inline spinner for button loading state
function BtrSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin .6s linear infinite', flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// ─── BtrCard ────────────────────────────────────────────────

interface BtrCardProps {
  children: ReactNode
  elevated?: boolean
  padding?: number | string
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

export const BtrCard = forwardRef<HTMLDivElement, BtrCardProps>(
  ({ children, elevated, padding = 20, onClick, className, style }, ref) => {
    const base = elevated ? cardElevated : card

    const merged: CSSProperties = {
      ...base,
      padding,
      cursor: onClick ? 'pointer' : undefined,
      ...style,
    }

    const hoverClass = onClick ? ['card-h', className].filter(Boolean).join(' ') : className

    return (
      <div ref={ref} style={merged} className={hoverClass || undefined} onClick={onClick}>
        {children}
      </div>
    )
  }
)
BtrCard.displayName = 'BtrCard'

// ─── BtrBadge ───────────────────────────────────────────────

type BtrBadgeSize = 'sm' | 'md'

interface BtrBadgeProps {
  children: ReactNode
  color?: string
  size?: BtrBadgeSize
  style?: CSSProperties
}

const badgeSizeMap: Record<BtrBadgeSize, CSSProperties> = {
  sm: { fontSize: 10, padding: '2px 8px', letterSpacing: '0.05em' },
  md: { fontSize: 12, padding: '4px 12px', letterSpacing: '0.04em' },
}

export function BtrBadge({ children, color = c.pink, size = 'sm', style }: BtrBadgeProps) {
  // compute a dim background from the color
  const dimBg = color + '14' // ~8% opacity hex suffix

  return (
    <span
      style={{
        fontFamily: font.sans,
        fontWeight: 600,
        textTransform: 'uppercase',
        color,
        background: dimBg,
        borderRadius: radius.pill,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        ...badgeSizeMap[size],
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ─── BtrInput ───────────────────────────────────────────────

interface BtrInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const BtrInput = forwardRef<HTMLInputElement, BtrInputProps>(
  ({ error, style, ...props }, ref) => {
    const [focused, setFocused] = useState(false)

    return (
      <input
        ref={ref}
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        style={{
          ...inputStyle,
          fontSize: 14,
          padding: '10px 14px',
          borderColor: error ? c.red : focused ? c.pink : c.border,
          ...style,
        }}
      />
    )
  }
)
BtrInput.displayName = 'BtrInput'

// ─── BtrAvatar ──────────────────────────────────────────────

type BtrAvatarSize = 'sm' | 'md' | 'lg'

interface BtrAvatarProps {
  name: string
  size?: BtrAvatarSize
  tierColor?: string
  style?: CSSProperties
}

const avatarSizeMap: Record<BtrAvatarSize, { wh: number; fontSize: number; border: number }> = {
  sm: { wh: 28, fontSize: 11, border: 2 },
  md: { wh: 36, fontSize: 14, border: 2 },
  lg: { wh: 48, fontSize: 18, border: 3 },
}

export function BtrAvatar({ name, size = 'md', tierColor, style }: BtrAvatarProps) {
  const s = avatarSizeMap[size]
  const letter = (name || '?').charAt(0).toUpperCase()

  return (
    <div
      style={{
        width: s.wh,
        height: s.wh,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: c.elevated,
        border: tierColor ? `${s.border}px solid ${tierColor}` : `${s.border}px solid ${c.border}`,
        fontFamily: font.sans,
        fontWeight: 700,
        fontSize: s.fontSize,
        color: tierColor || c.text2,
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {letter}
    </div>
  )
}

// ─── BtrProgress ────────────────────────────────────────────

interface BtrProgressProps {
  value: number // 0-100
  color?: string
  height?: number
  style?: CSSProperties
}

export function BtrProgress({ value, color = c.pink, height = 4, style }: BtrProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div
      style={{
        width: '100%',
        height,
        background: c.border,
        borderRadius: height / 2,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          background: color,
          borderRadius: height / 2,
          transition: 'width .4s cubic-bezier(.25,.1,.25,1)',
        }}
      />
    </div>
  )
}

// ─── BtrStat ────────────────────────────────────────────────

type BtrStatSize = 'sm' | 'md' | 'lg'

interface BtrStatProps {
  label: string
  value: string | number
  color?: string
  size?: BtrStatSize
  style?: CSSProperties
}

const statSizeMap: Record<BtrStatSize, { valueFontSize: number; labelFontSize: number }> = {
  sm: { valueFontSize: 18, labelFontSize: 10 },
  md: { valueFontSize: 28, labelFontSize: 11 },
  lg: { valueFontSize: 48, labelFontSize: 12 },
}

export function BtrStat({ label, value, color = c.text, size = 'md', style }: BtrStatProps) {
  const s = statSizeMap[size]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }}>
      <span
        style={{
          fontFamily: font.mono,
          fontWeight: 700,
          fontSize: s.valueFontSize,
          color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: font.sans,
          fontWeight: 500,
          fontSize: s.labelFontSize,
          color: c.text3,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  )
}

// ─── BtrModal ───────────────────────────────────────────────

interface BtrModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: number
}

export function BtrModal({ open, onClose, title, children, maxWidth = 480 }: BtrModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        // Backdrop click — close if click is outside content
        if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
          onClose()
        }
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.7)',
          backdropFilter: 'blur(4px)',
        }}
      />
      {/* Content */}
      <div
        ref={contentRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: c.elevated,
          border: `1px solid ${c.border}`,
          borderRadius: radius.xl,
          padding: 24,
          animation: 'fadeUp .25s cubic-bezier(.4,0,.2,1) both',
        }}
        className="fade-up"
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <h2
              style={{
                fontFamily: font.sans,
                fontWeight: 700,
                fontSize: 20,
                color: c.text,
                margin: 0,
              }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: c.text3,
                fontSize: 20,
                cursor: 'pointer',
                padding: 4,
                lineHeight: 1,
                transition: 'color .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = c.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = c.text3)}
              aria-label="Close"
            >
              &#x2715;
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ─── BtrSkeleton ────────────────────────────────────────────

interface BtrSkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: number
  style?: CSSProperties
}

export function BtrSkeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }: BtrSkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius,
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

// ─── BtrTooltip ─────────────────────────────────────────────

interface BtrTooltipProps {
  content: ReactNode
  children: ReactNode
}

export function BtrTooltip({ content, children }: BtrTooltipProps) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  const handleEnter = () => {
    setShow(true)
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      })
    }
  }

  const handleLeave = () => {
    setShow(false)
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>
      {show && pos && (
        <div
          ref={tipRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
            zIndex: 1100,
            background: c.hover,
            border: `1px solid ${c.border}`,
            borderRadius: radius.sm,
            padding: '6px 10px',
            fontFamily: font.sans,
            fontSize: 12,
            color: c.text2,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'fadeUp .15s cubic-bezier(.4,0,.2,1) both',
          }}
          className="fade-up"
        >
          {content}
        </div>
      )}
    </>
  )
}
