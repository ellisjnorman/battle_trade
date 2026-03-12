'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c } from '@/app/design'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirect') ?? '/dashboard'
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'
  const { login, authenticated, user, ready } = usePrivy()

  useEffect(() => {
    if (!ready) return
    if (authenticated && user) {
      getOrCreateProfile(user).then(profile => {
        if (profile) localStorage.setItem('bt_profile_id', profile.id)
        router.replace(redirect)
      }).catch(err => {
        console.error('[auth] getOrCreateProfile failed:', err)
        router.replace(redirect)
      })
    }
  }, [ready, authenticated, user, router, redirect])

  return (
    <div style={{background:c.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:28}}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-main.png" alt="Battle Trade" style={{width:'100%',maxWidth:260,height:'auto',cursor:'pointer'}} onClick={()=>router.push('/')} />
      <div style={{textAlign:'center'}}>
        <div style={{fontFamily:font.sans,fontSize:24,fontWeight:700,color:c.text}}>
          {authenticated ? 'Loading...' : 'Sign In'}
        </div>
        <div style={{fontFamily:font.sans,fontSize:13,color:c.text3,marginTop:8}}>
          {authenticated ? 'Setting up your profile' : 'Google · Apple · Email · Wallet'}
        </div>
      </div>
      {!authenticated && (
        <button onClick={login} className="btn-p" style={{
          fontFamily:font.sans,fontSize:16,fontWeight:600,
          color:c.bg,background:c.pink,border:'none',
          padding:'14px 40px',cursor:'pointer',borderRadius:10,
        }}>
          Open Sign In
        </button>
      )}
      <div style={{fontFamily:font.sans,fontSize:11,color:c.text4,position:'absolute',bottom:24}}>
        Powered by Privy · WalletConnect
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{background:c.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontFamily:font.sans,fontSize:16,color:c.text3}}>Loading...</span>
      </div>
    }>
      <LoginInner />
    </Suspense>
  )
}
