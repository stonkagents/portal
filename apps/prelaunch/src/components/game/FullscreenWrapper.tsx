/**
 * Purpose: Fullscreen wrapper for game canvases. Desktop uses Fullscreen API,
 *          mobile uses CSS fixed-position viewport overlay (auto-triggered).
 */
'use client';

import { useRef, useState, useCallback, useEffect, createContext, useContext } from 'react';

interface FullscreenContextValue {
  isFullscreen: boolean;
  scaleFactor: number;
}

const FullscreenContext = createContext<FullscreenContextValue>({ isFullscreen: false, scaleFactor: 1 });

export function useFullscreenContext() {
  return useContext(FullscreenContext);
}

interface FullscreenWrapperProps {
  children: React.ReactNode;
}

/** Detect mobile by viewport width (matches our responsive breakpoint) */
function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

export function FullscreenWrapper({ children }: FullscreenWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileFS, setIsMobileFS] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);

  /* Auto-enter mobile fullscreen on mount if mobile */
  useEffect(() => {
    if (isMobileViewport()) {
      setIsMobileFS(true);
      setIsFullscreen(true);
      const sw = window.innerWidth;
      setScaleFactor(Math.min(sw / 640, 4));
    }
  }, []);

  /* Track resize for mobile scale factor */
  useEffect(() => {
    if (!isMobileFS) return;
    function onResize() {
      const sw = window.innerWidth;
      setScaleFactor(Math.min(sw / 640, 4));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobileFS]);

  /* Desktop: Fullscreen API */
  const enterDesktopFS = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
        await (el as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      }
    } catch {
      /* Fullscreen denied — fall back to mobile-style overlay */
      setIsMobileFS(true);
      setIsFullscreen(true);
      setScaleFactor(Math.min(window.innerWidth / 640, 4));
    }
  }, []);

  const exitDesktopFS = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
        await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
      }
    } catch {
      /* Ignore */
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isMobileFS) {
      setIsMobileFS(false);
      setIsFullscreen(false);
      setScaleFactor(1);
      return;
    }
    if (isFullscreen) {
      exitDesktopFS();
    } else {
      if (isMobileViewport()) {
        /* Mobile: use CSS overlay */
        setIsMobileFS(true);
        setIsFullscreen(true);
        setScaleFactor(Math.min(window.innerWidth / 640, 4));
      } else {
        enterDesktopFS();
      }
    }
  }, [isFullscreen, isMobileFS, enterDesktopFS, exitDesktopFS]);

  /* Desktop fullscreen change listener */
  useEffect(() => {
    function onFSChange() {
      const fsEl =
        document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      const active = fsEl === containerRef.current;
      if (!isMobileFS) {
        setIsFullscreen(active);
        if (active) {
          const screenW = window.screen.width * (window.devicePixelRatio || 1);
          setScaleFactor(Math.min(screenW / 640, 4));
        } else {
          setScaleFactor(1);
        }
      }
    }
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFSChange);
      document.removeEventListener('webkitfullscreenchange', onFSChange);
    };
  }, [isMobileFS]);

  /* Mobile overlay: fixed position covering entire viewport */
  const mobileOverlayClass = isMobileFS ? 'fixed inset-0 z-50 flex items-center justify-center bg-bg-void' : '';

  const desktopFSClass = isFullscreen && !isMobileFS ? 'flex items-center justify-center bg-bg-void w-screen h-screen' : '';

  const baseClass = !isFullscreen && !isMobileFS ? 'w-full max-w-[640px] mx-auto' : '';

  return (
    <FullscreenContext.Provider value={{ isFullscreen: isFullscreen || isMobileFS, scaleFactor }}>
      <div
        ref={containerRef}
        className={`relative ${mobileOverlayClass} ${desktopFSClass} ${baseClass}`}
        data-testid="game-fullscreen-container"
      >
        {children}

        {/* Fullscreen toggle / exit button */}
        <button
          data-testid="fullscreen-toggle-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen || isMobileFS ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="absolute top-2 right-2 z-[60] w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded bg-bg-void/70 border border-border-default text-text-secondary hover:text-accent-green hover:border-accent-green transition-colors duration-150"
        >
          {isFullscreen || isMobileFS ? (
            /* Shrink / close icon */
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
            </svg>
          ) : (
            /* Expand icon */
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          )}
        </button>
      </div>
    </FullscreenContext.Provider>
  );
}
