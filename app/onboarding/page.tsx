'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, globalCSS, radius } from '@/app/design'

const STEPS = [
  { id: 'name', label: 'Display Name' },
  { id: 'handle', label: 'Handle' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'bio', label: 'About You' },
  { id: 'ready', label: 'Ready' },
]

const AVATAR_OPTIONS = [
  { id: 'bull', label: 'Bull', color: '#22C55E', gradient: 'linear-gradient(135deg, #065F46, #22C55E)' },
  { id: 'bear', label: 'Bear', color: '#EF4444', gradient: 'linear-gradient(135deg, #7F1D1D, #EF4444)' },
  { id: 'shark', label: 'Shark', color: '#3B82F6', gradient: 'linear-gradient(135deg, #1E3A5F, #3B82F6)' },
  { id: 'eagle', label: 'Eagle', color: '#F59E0B', gradient: 'linear-gradient(135deg, #78350F, #F59E0B)' },
  { id: 'wolf', label: 'Wolf', color: '#8B5CF6', gradient: 'linear-gradient(135deg, #3B0764, #8B5CF6)' },
  { id: 'dragon', label: 'Dragon', color: '#F97316', gradient: 'linear-gradient(135deg, #7C2D12, #F97316)' },
  { id: 'fox', label: 'Fox', color: '#EC4899', gradient: 'linear-gradient(135deg, #831843, #EC4899)' },
  { id: 'lion', label: 'Lion', color: '#EAB308', gradient: 'linear-gradient(135deg, #713F12, #EAB308)' },
]

// SVG avatar icons — clean vector style
const AVATAR_SVG: Record<string, string> = {
  bull: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#065F46"/><path d="M20 28c-4-8-2-16 2-18s8 2 10 8M60 28c4-8 2-16-2-18s-8 2-10 8" stroke="#22C55E" stroke-width="3" stroke-linecap="round"/><ellipse cx="40" cy="44" rx="16" ry="14" fill="#22C55E" opacity=".2"/><circle cx="32" cy="38" r="3" fill="#22C55E"/><circle cx="48" cy="38" r="3" fill="#22C55E"/><ellipse cx="40" cy="50" rx="8" ry="5" stroke="#22C55E" stroke-width="2" fill="none"/><circle cx="36" cy="50" r="1.5" fill="#22C55E"/><circle cx="44" cy="50" r="1.5" fill="#22C55E"/></svg>`,
  bear: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#7F1D1D"/><circle cx="24" cy="22" r="8" fill="#EF4444" opacity=".3"/><circle cx="56" cy="22" r="8" fill="#EF4444" opacity=".3"/><ellipse cx="40" cy="44" rx="18" ry="16" fill="#EF4444" opacity=".15"/><circle cx="32" cy="38" r="3" fill="#EF4444"/><circle cx="48" cy="38" r="3" fill="#EF4444"/><ellipse cx="40" cy="48" rx="5" ry="3" fill="#EF4444" opacity=".5"/><path d="M35 54c2 3 8 3 10 0" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/></svg>`,
  shark: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#1E3A5F"/><path d="M40 12l6 16h-12l6-16z" fill="#3B82F6" opacity=".4"/><ellipse cx="40" cy="44" rx="20" ry="14" fill="#3B82F6" opacity=".15"/><circle cx="30" cy="38" r="3" fill="#3B82F6"/><circle cx="50" cy="38" r="3" fill="#3B82F6"/><path d="M28 50h24" stroke="#3B82F6" stroke-width="2"/><path d="M30 50l2-3 3 3 3-3 3 3 3-3 3 3 3-3 2 3" stroke="#3B82F6" stroke-width="1.5" fill="none"/></svg>`,
  eagle: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#78350F"/><path d="M16 32c4-2 10-1 14 2M64 32c-4-2-10-1-14 2" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="38" r="3.5" fill="#F59E0B"/><circle cx="48" cy="38" r="3.5" fill="#F59E0B"/><path d="M36 46l4 8 4-8" fill="#F59E0B" opacity=".6"/><circle cx="32" cy="38" r="1.5" fill="#78350F"/><circle cx="48" cy="38" r="1.5" fill="#78350F"/></svg>`,
  wolf: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#3B0764"/><path d="M22 20l6 16M58 20l-6 16" stroke="#8B5CF6" stroke-width="3" stroke-linecap="round"/><ellipse cx="40" cy="44" rx="16" ry="14" fill="#8B5CF6" opacity=".15"/><circle cx="32" cy="38" r="3" fill="#8B5CF6"/><circle cx="48" cy="38" r="3" fill="#8B5CF6"/><path d="M34 50l6 4 6-4" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`,
  dragon: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#7C2D12"/><path d="M20 18c0-6 6-10 10-6l-4 12M60 18c0-6-6-10-10-6l4 12" stroke="#F97316" stroke-width="2" fill="none"/><circle cx="32" cy="38" r="4" fill="#F97316"/><circle cx="48" cy="38" r="4" fill="#F97316"/><circle cx="32" cy="38" r="2" fill="#7C2D12"/><circle cx="48" cy="38" r="2" fill="#7C2D12"/><path d="M34 52c3 2 9 2 12 0" stroke="#F97316" stroke-width="2" stroke-linecap="round"/><path d="M38 56l2 4 2-4" fill="#F97316" opacity=".5"/></svg>`,
  fox: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#831843"/><path d="M20 16l10 20M60 16l-10 20" stroke="#EC4899" stroke-width="3" stroke-linecap="round"/><ellipse cx="40" cy="46" rx="14" ry="10" fill="#EC4899" opacity=".15"/><circle cx="32" cy="38" r="3" fill="#EC4899"/><circle cx="48" cy="38" r="3" fill="#EC4899"/><circle cx="40" cy="46" r="3" fill="#EC4899" opacity=".4"/><path d="M32 52c4 3 12 3 16 0" stroke="#EC4899" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`,
  lion: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#713F12"/><circle cx="40" cy="40" r="28" stroke="#EAB308" stroke-width="3" opacity=".3" fill="none" stroke-dasharray="4 3"/><ellipse cx="40" cy="44" rx="16" ry="14" fill="#EAB308" opacity=".15"/><circle cx="32" cy="38" r="3" fill="#EAB308"/><circle cx="48" cy="38" r="3" fill="#EAB308"/><ellipse cx="40" cy="47" rx="4" ry="2.5" fill="#EAB308" opacity=".4"/><path d="M34 52c3 2 9 2 12 0" stroke="#EAB308" stroke-width="2" stroke-linecap="round"/></svg>`,
}

export default function OnboardingPage() {
  const router = useRouter()
  const { authenticated, user, ready, getAccessToken } = usePrivy()
  const [step, setStep] = useState(0)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [credits, setCredits] = useState(0)

  // Form fields
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [bio, setBio] = useState('')

  const nameRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auth check + profile init
  useEffect(() => {
    if (!ready) return
    if (!authenticated || !user) { router.push('/login'); return }

    const init = async () => {
      try {
        const profile = await getOrCreateProfile(user, getAccessToken)
        if (profile) {
          setProfileId(profile.id)
          setCredits(profile.credits ?? 0)
          localStorage.setItem('bt_profile_id', profile.id)

          // If profile is already complete, skip to dashboard
          if (profile.display_name && profile.display_name !== `Trader_${profile.display_name.slice(-4)}` &&
              !profile.display_name.startsWith('0x') && !profile.display_name.includes('...')) {
            const res = await fetch(`/api/profile/${profile.id}`)
            if (res.ok) {
              const data = await res.json()
              if (data.profile?.handle) {
                router.replace('/dashboard')
                return
              }
            }
          }

          if (profile.display_name) setDisplayName(profile.display_name)
        }
      } catch (err) {
        console.error('[onboarding] init error:', err)
      }
      setInitializing(false)
    }
    init()
  }, [ready, authenticated, user, router])

  // Auto-focus inputs on step change
  useEffect(() => {
    if (step === 0) setTimeout(() => nameRef.current?.focus(), 200)
    if (step === 1) setTimeout(() => handleRef.current?.focus(), 200)
  }, [step])

  const progress = ((step + 1) / STEPS.length) * 100

  const canAdvance = () => {
    if (step === 0) return displayName.trim().length >= 2
    if (step === 1) return true
    if (step === 2) return selectedAvatar !== null || uploadedImage !== null
    if (step === 3) return true
    return true
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setUploadedImage(reader.result as string)
      setSelectedAvatar(null) // clear preset selection
    }
    reader.readAsDataURL(file)
  }

  const advance = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }

    // Final step — save everything
    if (!profileId) return
    setSaving(true)

    try {
      const updates: Record<string, string | boolean | null> = {
        display_name: displayName.trim(),
        onboarding_complete: true,
      }
      const finalHandle = handle.trim()
        ? handle.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
        : displayName.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16).toLowerCase() + Math.random().toString(36).slice(2, 5)
      updates.handle = finalHandle
      if (uploadedImage) {
        updates.avatar_url = uploadedImage
      } else if (selectedAvatar) {
        updates.avatar_url = selectedAvatar
      }
      if (bio.trim()) updates.bio = bio.trim().slice(0, 160)

      const patchHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const token = await getAccessToken()
        if (token) patchHeaders['Authorization'] = `Bearer ${token}`
      } catch {}

      const res = await fetch(`/api/profile/${profileId}`, {
        method: 'PATCH',
        headers: patchHeaders,
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        console.error('[onboarding] save failed:', await res.text())
      }

      router.replace('/dashboard')
    } catch (err) {
      console.error('[onboarding] save error:', err)
      router.replace('/dashboard')
    }
  }

  if (!ready || initializing) {
    return (
      <div style={{ background: c.bg, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{globalCSS}</style>
        <div className="skeleton" style={{ width: 300, height: 400, borderRadius: radius.xl }} />
      </div>
    )
  }

  const getSelectedAvatarDisplay = () => {
    if (uploadedImage) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploadedImage} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 24 }} />
      )
    }
    if (selectedAvatar && AVATAR_SVG[selectedAvatar]) {
      return <div dangerouslySetInnerHTML={{ __html: AVATAR_SVG[selectedAvatar] }} style={{ width: '100%', height: '100%' }} />
    }
    return <span style={{ fontSize: 48, opacity: 0.3 }}>?</span>
  }

  return (
    <div style={{ background: c.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#FFF' }}>
      <style>{globalCSS}{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        @keyframes scaleIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.3)}50%{box-shadow:0 0 40px rgba(245,160,208,.6)}}
        .step-enter{animation:fadeUp .35s cubic-bezier(.4,0,.2,1) both}
        .avatar-card{transition:all .2s;cursor:pointer;border:2px solid transparent;position:relative;overflow:hidden}
        .avatar-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
        .avatar-card.selected{border-color:${c.pink};box-shadow:0 0 24px rgba(245,160,208,.3)}
        .avatar-card.selected::after{content:'';position:absolute;inset:0;background:rgba(245,160,208,.08)}
        .ob-input{
          width:100%;padding:16px 18px;background:${c.surface};border:1.5px solid ${c.border};
          border-radius:${radius.md}px;color:${c.text};font-family:${font.sans};font-size:17px;
          outline:none;transition:border-color .15s;
        }
        .ob-input:focus{border-color:${c.pink}}
        .ob-input::placeholder{color:${c.text4}}
        .ob-textarea{
          width:100%;padding:16px 18px;background:${c.surface};border:1.5px solid ${c.border};
          border-radius:${radius.md}px;color:${c.text};font-family:${font.sans};font-size:15px;
          outline:none;transition:border-color .15s;resize:none;min-height:100px;
        }
        .ob-textarea:focus{border-color:${c.pink}}
        .ob-textarea::placeholder{color:${c.text4}}
        .upload-zone{
          border:2px dashed ${c.border};border-radius:${radius.lg}px;padding:24px;text-align:center;
          cursor:pointer;transition:all .2s;background:${c.surface}
        }
        .upload-zone:hover{border-color:${c.pink};background:rgba(245,160,208,.04)}
        .credit-badge{
          display:inline-flex;align-items:center;gap:6px;
          background:linear-gradient(135deg,rgba(245,160,208,.15),rgba(245,160,208,.05));
          border:1px solid rgba(245,160,208,.25);border-radius:20px;padding:6px 14px;
          animation:scaleIn .4s cubic-bezier(.34,1.56,.64,1) both;
        }
      `}</style>

      {/* Progress bar */}
      <div style={{ width: '100%', position: 'fixed', top: 0, zIndex: 100 }}>
        <div style={{ height: 3, background: c.surface, width: '100%' }}>
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${c.pink}, ${c.green})`,
            width: `${progress}%`, transition: 'width .4s cubic-bezier(.25,.1,.25,1)',
            boxShadow: `0 0 12px rgba(245,160,208,.4)`,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i <= step ? c.pink : c.border,
              transition: 'all .3s',
              boxShadow: i === step ? `0 0 8px ${c.pink}` : 'none',
            }} />
          ))}
        </div>
      </div>

      {/* Logo — bigger */}
      <div style={{ marginTop: 64, marginBottom: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-main.png" alt="Battle Trade"
          style={{ height: 56, width: 'auto', cursor: 'pointer' }}
          onClick={() => router.push('/')}
        />
      </div>

      {/* Step counter */}
      <div style={{
        fontFamily: font.mono, fontSize: 11, color: c.text3, letterSpacing: '.06em', marginBottom: 28,
      }}>
        STEP {step + 1} OF {STEPS.length}
      </div>

      {/* Content area */}
      <div style={{ width: '100%', maxWidth: 480, padding: '0 24px' }}>

        {/* Step 0: Display Name */}
        {step === 0 && (
          <div className="step-enter" key="step-name">
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontFamily: font.display, fontSize: 36, color: c.text, letterSpacing: '.02em', lineHeight: 1 }}>
                CHOOSE YOUR NAME
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginTop: 10 }}>
                This is how other traders will see you
              </div>
            </div>
            <input
              ref={nameRef}
              className="ob-input"
              type="text"
              placeholder="Your trader name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value.slice(0, 24))}
              onKeyDown={e => { if (e.key === 'Enter' && canAdvance()) advance() }}
            />
            <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, marginTop: 6, textAlign: 'right' }}>
              {displayName.length}/24
            </div>
            {credits > 0 && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <div className="credit-badge">
                  <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: c.pink }}>
                    +{credits.toLocaleString()}
                  </span>
                  <span style={{ fontFamily: font.sans, fontSize: 12, color: c.text3 }}>
                    welcome credits
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Handle */}
        {step === 1 && (
          <div className="step-enter" key="step-handle">
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontFamily: font.display, fontSize: 36, color: c.text, letterSpacing: '.02em', lineHeight: 1 }}>
                PICK A HANDLE
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginTop: 10 }}>
                Your unique @username (optional)
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
                fontFamily: font.mono, fontSize: 17, color: c.text3,
              }}>@</span>
              <input
                ref={handleRef}
                className="ob-input"
                style={{ paddingLeft: 36 }}
                type="text"
                placeholder="username"
                value={handle}
                onChange={e => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                onKeyDown={e => { if (e.key === 'Enter') advance() }}
              />
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, marginTop: 6, textAlign: 'right' }}>
              {handle.length}/20
            </div>
          </div>
        )}

        {/* Step 2: Avatar — redesigned with upload */}
        {step === 2 && (
          <div className="step-enter" key="step-avatar">
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontFamily: font.display, fontSize: 36, color: c.text, letterSpacing: '.02em', lineHeight: 1 }}>
                YOUR AVATAR
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginTop: 10 }}>
                Upload a photo or pick a trading persona
              </div>
            </div>

            {/* Upload zone */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <div
              className="upload-zone"
              onClick={() => fileRef.current?.click()}
              style={{
                marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 16,
                ...(uploadedImage ? { borderColor: c.pink, background: 'rgba(245,160,208,.04)' } : {}),
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 14, overflow: 'hidden',
                background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {uploadedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadedImage} alt="upload" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke={c.text3} strokeWidth="2" strokeLinecap="round"/><path d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke={c.text3} strokeWidth="2" strokeLinecap="round"/></svg>
                )}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: uploadedImage ? c.pink : c.text2 }}>
                  {uploadedImage ? 'Photo uploaded' : 'Upload your photo'}
                </div>
                <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, marginTop: 2 }}>
                  {uploadedImage ? 'Tap to change' : 'JPG, PNG up to 2MB'}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, letterSpacing: '.08em' }}>OR PICK A PERSONA</span>
              <div style={{ flex: 1, height: 1, background: c.border }} />
            </div>

            {/* Avatar grid — vector art style */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {AVATAR_OPTIONS.map(a => (
                <button
                  key={a.id}
                  className={`avatar-card ${selectedAvatar === a.id && !uploadedImage ? 'selected' : ''}`}
                  onClick={() => { setSelectedAvatar(a.id); setUploadedImage(null) }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 4px 10px', borderRadius: radius.lg, background: a.gradient,
                  }}
                >
                  <div
                    style={{ width: 48, height: 48 }}
                    dangerouslySetInnerHTML={{ __html: AVATAR_SVG[a.id] }}
                  />
                  <span style={{
                    fontFamily: font.sans, fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
                    color: selectedAvatar === a.id && !uploadedImage ? '#fff' : 'rgba(255,255,255,.7)',
                    textTransform: 'uppercase',
                  }}>
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Bio */}
        {step === 3 && (
          <div className="step-enter" key="step-bio">
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontFamily: font.display, fontSize: 36, color: c.text, letterSpacing: '.02em', lineHeight: 1 }}>
                TELL US ABOUT YOU
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginTop: 10 }}>
                Short bio visible on your profile (optional)
              </div>
            </div>
            <textarea
              className="ob-textarea"
              placeholder="Crypto trader since 2021, love volatility..."
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 160))}
            />
            <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, marginTop: 6, textAlign: 'right' }}>
              {bio.length}/160
            </div>
          </div>
        )}

        {/* Step 4: Ready — shows profile card + credit bonus */}
        {step === 4 && (
          <div className="step-enter" key="step-ready" style={{ textAlign: 'center' }}>
            {/* Avatar preview — large */}
            <div style={{
              width: 100, height: 100, borderRadius: 24, margin: '0 auto 20px',
              background: selectedAvatar ? AVATAR_OPTIONS.find(a => a.id === selectedAvatar)?.gradient : c.surface,
              border: `2px solid ${c.pink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: `0 0 32px rgba(245,160,208,.25)`, animation: 'scaleIn .4s cubic-bezier(.34,1.56,.64,1) both',
            }}>
              {getSelectedAvatarDisplay()}
            </div>

            <div style={{ fontFamily: font.display, fontSize: 40, color: c.text, letterSpacing: '.02em', lineHeight: 1, marginBottom: 8 }}>
              YOU&apos;RE ALL SET
            </div>
            <div style={{ fontFamily: font.sans, fontSize: 18, color: c.text, fontWeight: 600, marginBottom: 4 }}>
              {displayName}
            </div>
            {(handle || displayName) && (
              <div style={{ fontFamily: font.mono, fontSize: 13, color: c.pink, marginBottom: 20 }}>
                @{handle || displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}
              </div>
            )}
            {bio && (
              <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, maxWidth: 320, margin: '0 auto 20px', lineHeight: 1.5 }}>
                {bio}
              </div>
            )}

            {/* Credit bonus callout */}
            <div style={{
              background: `linear-gradient(135deg, rgba(245,160,208,.08), rgba(34,197,94,.08))`,
              border: `1px solid rgba(245,160,208,.2)`,
              borderRadius: radius.lg, padding: '16px 24px', marginBottom: 8,
            }}>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: c.text3, letterSpacing: '.06em', marginBottom: 6 }}>
                PROFILE COMPLETE BONUS
              </div>
              <div style={{ fontFamily: font.display, fontSize: 32, color: c.pink, lineHeight: 1 }}>
                +1,000
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text3, marginTop: 4 }}>
                credits added to your account
              </div>
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 11, color: c.text4, marginTop: 4 }}>
              {(credits + 1000).toLocaleString()} total credits
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 32, paddingBottom: 80 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="btn-s"
              style={{
                flex: 1, padding: '16px 0', fontFamily: font.sans, fontSize: 14, fontWeight: 600,
                color: c.text3, background: c.surface, border: `1px solid ${c.border}`,
                borderRadius: radius.md, cursor: 'pointer',
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={advance}
            disabled={!canAdvance() || saving}
            className="btn-p"
            style={{
              flex: step > 0 ? 2 : 1, padding: '16px 0', fontFamily: font.sans, fontSize: 16, fontWeight: 700,
              color: c.bg, background: canAdvance() ? c.pink : c.border,
              border: 'none', borderRadius: radius.md,
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : step === STEPS.length - 1 ? 'Start Trading' : step === 1 || step === 3 ? 'Next' : 'Next'}
          </button>
        </div>

        {/* Skip link for optional steps */}
        {(step === 1 || step === 3) && (
          <div style={{ textAlign: 'center', marginTop: -64, marginBottom: 80 }}>
            <button
              onClick={advance}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: font.sans, fontSize: 12, color: c.text4,
              }}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', bottom: 24, fontFamily: font.sans, fontSize: 11, color: c.text4,
      }}>
        Powered by Privy
      </div>
    </div>
  )
}
