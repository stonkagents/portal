/**
 * Purpose: Detect device type (mobile/tablet/desktop) and OS from user agent.
 *          SSR-safe — returns 'unknown' until hydrated on client.
 */
import { useState, useEffect } from 'react';

type DeviceOS = 'ios' | 'android' | 'macos' | 'windows' | 'unknown';

export interface DeviceType {
  /** iOS or Android */
  isMobile: boolean;
  /** iPad-class devices */
  isTablet: boolean;
  /** macOS or Windows (non-tablet) */
  isDesktop: boolean;
  /** Detected operating system */
  os: DeviceOS;
}

const DEFAULT: DeviceType = { isMobile: false, isTablet: false, isDesktop: false, os: 'unknown' };

function detect(): DeviceType {
  const ua = navigator.userAgent;

  // iPad reports as Mac in modern Safari — check touch + Mac combo
  const isIPad = /Mac/i.test(ua) && navigator.maxTouchPoints > 1;
  const isIPhone = /iPhone/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isAndroidTablet = isAndroid && !/Mobile/i.test(ua);
  const isMac = /Mac/i.test(ua) && !isIPad;
  const isWindows = /Win/i.test(ua);

  const isMobile = isIPhone || (isAndroid && !isAndroidTablet);
  const isTablet = isIPad || isAndroidTablet;
  const isDesktop = !isMobile && !isTablet;

  let os: DeviceOS = 'unknown';
  if (isIPhone || isIPad) os = 'ios';
  else if (isAndroid) os = 'android';
  else if (isMac) os = 'macos';
  else if (isWindows) os = 'windows';

  return { isMobile, isTablet, isDesktop, os };
}

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>(DEFAULT);

  useEffect(() => {
    setDevice(detect());
  }, []);

  return device;
}
