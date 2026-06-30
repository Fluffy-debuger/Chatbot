import React from 'react'
import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react'
import ChatApp from './components/ChatApp.jsx'
import './App.css'

export default function App() {
  return (
    <>
      <SignedIn>
        <ChatApp />
      </SignedIn>
      <SignedOut>
        <AuthScreen />
      </SignedOut>
    </>
  )
}

function AuthScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="auth-mark">CB</span>
          <h1>Welcome to ChatBot</h1>
          
        </div>
        <SignIn
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: '#d9622b',
              colorBackground: '#ffffff',
              colorText: '#211c17',
              fontFamily: 'Inter, sans-serif',
              borderRadius: '10px',
            },
            elements: {
              card: { boxShadow: 'none', border: '1px solid #e3dcd0' },
              footerActionLink: { color: '#d9622b' },
            },
          }}
        />
      </div>
    </div>
  )
}
