/**
 * Purpose: Single pre-launch page — splash overlay → hero + games + chat hub
 */
'use client';

import { useState } from 'react';
import { SplashOverlay } from '@/components/splash/SplashOverlay';
import { HeroSection } from '@/components/hero/HeroSection';
import { GameZone } from '@/components/game/GameZone';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { Footer } from '@/components/footer/Footer';

export default function PrelaunchPage() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      <SplashOverlay onDismiss={() => setSplashDone(true)} />

      <main
        className={`min-h-screen flex flex-col transition-opacity duration-500 ${
          splashDone ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <HeroSection />
        <GameZone />
        <Footer />
      </main>

      {splashDone && <ChatBubble />}
    </>
  );
}
