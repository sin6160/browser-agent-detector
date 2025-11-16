import { BrowserInfo, DeviceFingerprint } from './types';

export class FingerprintRegistry {
  private cache: Promise<DeviceFingerprint> | null = null;

  resolve(): Promise<DeviceFingerprint> {
    if (!this.cache) {
      this.cache = this.computeFingerprint();
    }
    return this.cache;
  }

  private async computeFingerprint(): Promise<DeviceFingerprint> {
    if (typeof window === 'undefined') {
      return this.placeholderFingerprint();
    }

    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
    const userAgent = navigator.userAgent || 'unknown';
    const vendor = navigator.vendor || 'unknown';
    const appVersion = navigator.appVersion || 'unknown';
    const platform = navigator.platform || 'unknown';

    const browserInfo = this.getBrowserInfo(userAgent, vendor);
    const brands = this.getBrandInfo();

    const { canvasFingerprint, canvasSignals } = this.getCanvasFingerprint();
    const { webglFingerprint, webglSignals } = this.getWebGLFingerprint();

    const antiFingerprintSignals = [
      ...canvasSignals,
      ...webglSignals,
      ...this.collectAntiFingerprintSignals(userAgent, browserInfo),
    ];

    return {
      screen_resolution: screenResolution,
      timezone,
      user_agent: userAgent,
      user_agent_hash: this.hashString(userAgent),
      user_agent_brands: brands,
      vendor,
      app_version: appVersion,
      platform,
      browser_info: browserInfo,
      canvas_fingerprint: canvasFingerprint,
      webgl_fingerprint: webglFingerprint,
      http_signature_state: 'unknown',
      anti_fingerprint_signals: antiFingerprintSignals,
      network_fingerprint_source: 'client',
    };
  }

  private placeholderFingerprint(): DeviceFingerprint {
    return {
      screen_resolution: '0x0',
      timezone: 'UTC',
      user_agent: 'ssr',
      user_agent_hash: 'ssr',
      user_agent_brands: [],
      vendor: 'unknown',
      app_version: 'unknown',
      platform: 'server',
      browser_info: {
        name: 'server',
        version: '0',
        os: 'unknown',
        engine: 'unknown',
        is_chromium_based: false,
        is_chrome: false,
        is_pure_chromium: false,
      },
      canvas_fingerprint: 'unavailable',
      webgl_fingerprint: 'unavailable',
      http_signature_state: 'unknown',
      anti_fingerprint_signals: ['no-window'],
      network_fingerprint_source: 'server',
    };
  }

  private getBrowserInfo(userAgent: string, vendor: string) {
    const info = {
      name: 'Unknown',
      version: '0',
      os: 'unknown',
      engine: 'unknown',
      is_chromium_based: false,
      is_chrome: false,
      is_pure_chromium: false,
    };

    const ua = userAgent;

    if (/Windows/.test(ua)) info.os = 'Windows';
    else if (/Mac OS X/.test(ua)) info.os = 'macOS';
    else if (/Linux/.test(ua)) info.os = 'Linux';
    else if (/Android/.test(ua)) info.os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) info.os = 'iOS';

    if (/Gecko\//.test(ua) && /Firefox\//.test(ua)) {
      info.engine = 'Gecko';
    } else if (/AppleWebKit\//.test(ua)) {
      if (/Chrome\//.test(ua) || /Chromium\//.test(ua)) {
        info.engine = 'Blink';
      } else {
        info.engine = 'WebKit';
      }
    } else if (/Trident\//.test(ua)) {
      info.engine = 'Trident';
    } else if (/Presto\//.test(ua)) {
      info.engine = 'Presto';
    }

    const chromiumVendors = ['Google Inc.', 'Google LLC'];
    if (/Edge|Edg\//.test(ua)) {
      info.name = 'Edge';
      info.is_chromium_based = true;
      info.version = this.extractVersion(ua, /Edge?\/([0-9.]+)/);
    } else if (/Firefox/.test(ua)) {
      info.name = 'Firefox';
      info.version = this.extractVersion(ua, /Firefox\/([0-9.]+)/);
    } else if (/Chromium\//.test(ua)) {
      info.name = 'Chromium';
      info.is_chromium_based = true;
      info.is_pure_chromium = true;
      info.version = this.extractVersion(ua, /Chromium\/([0-9.]+)/);
    } else if (/Chrome\//.test(ua)) {
      info.name = chromiumVendors.includes(vendor) ? 'Google Chrome' : 'Chromium-based Browser';
      info.is_chromium_based = true;
      info.is_chrome = chromiumVendors.includes(vendor);
      info.version = this.extractVersion(ua, /Chrome\/([0-9.]+)/);
    } else if (/Safari/.test(ua)) {
      info.name = 'Safari';
      info.version = this.extractVersion(ua, /Version\/([0-9.]+)/);
    } else if (/OPR|Opera/.test(ua)) {
      info.name = 'Opera';
      info.is_chromium_based = /OPR/.test(ua);
      info.version = this.extractVersion(ua, /OPR\/([0-9.]+)/);
    }

    return info;
  }

  private extractVersion(ua: string, pattern: RegExp): string {
    const match = ua.match(pattern);
    return match ? match[1] : '0';
  }

  private getBrandInfo(): string[] {
    try {
      // @ts-ignore
      if (navigator.userAgentData?.brands) {
        // @ts-ignore
        return navigator.userAgentData.brands.map(
          (brand: { brand: string; version: string } | { name: string; version: string }) => {
            const name = 'brand' in brand ? brand.brand : brand.name;
            return `${name}/${brand.version}`;
          },
        );
      }
    } catch (error) {
      console.warn('userAgentData error', error);
    }
    return [];
  }

  private getCanvasFingerprint() {
    const signals: string[] = [];
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        signals.push('canvas_not_supported');
        return { canvasFingerprint: 'canvas_not_supported', canvasSignals: signals };
      }
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 10, 100, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('Browser Fingerprint', 10, 30);
      return {
        canvasFingerprint: this.hashString(canvas.toDataURL()),
        canvasSignals: signals,
      };
    } catch (error) {
      signals.push('canvas_error');
      return { canvasFingerprint: 'canvas_error', canvasSignals: signals };
    }
  }

  private getWebGLFingerprint() {
    const signals: string[] = [];
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        signals.push('webgl_not_supported');
        return { webglFingerprint: 'webgl_not_supported', webglSignals: signals };
      }
      const debugInfo = (gl as WebGLRenderingContext).getExtension(
        'WEBGL_debug_renderer_info',
      );
      if (!debugInfo) {
        signals.push('webgl_no_debug_info');
        return { webglFingerprint: 'no_debug_info', webglSignals: signals };
      }
      const vendor = (gl as WebGLRenderingContext).getParameter(
        debugInfo.UNMASKED_VENDOR_WEBGL,
      );
      const renderer = (gl as WebGLRenderingContext).getParameter(
        debugInfo.UNMASKED_RENDERER_WEBGL,
      );
      return {
        webglFingerprint: this.hashString(`${vendor}_${renderer}`),
        webglSignals: signals,
      };
    } catch (error) {
      signals.push('webgl_error');
      return { webglFingerprint: 'webgl_error', webglSignals: signals };
    }
  }

  private hashString(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }

  private collectAntiFingerprintSignals(userAgent: string, browserInfo: BrowserInfo): string[] {
    const signals: string[] = [];

    try {
      if ((navigator as any).webdriver) {
        signals.push('navigator_webdriver_true');
      }
    } catch (error) {
      signals.push('webdriver_unavailable');
    }

    if (/HeadlessChrome|PhantomJS|electron/i.test(userAgent)) {
      signals.push('headless_user_agent');
    }

    try {
      if (browserInfo.is_chrome && typeof (window as any).chrome === 'undefined') {
        signals.push('chrome_runtime_missing');
      }
    } catch (error) {
      signals.push('chrome_runtime_unreachable');
    }

    try {
      const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
      if (languages.length === 0) {
        signals.push('languages_empty');
      } else if (navigator.language && languages[0] && navigator.language !== languages[0]) {
        signals.push('languages_mismatch');
      }
    } catch (error) {
      signals.push('languages_unavailable');
    }

    try {
      if (
        navigator.plugins &&
        browserInfo.is_chromium_based &&
        navigator.plugins.length === 0 &&
        !/Headless/i.test(userAgent)
      ) {
        signals.push('plugins_empty');
      }
    } catch (error) {
      signals.push('plugins_unavailable');
    }

    try {
      const isMobileUa = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
      const maxTouchPoints = Number((navigator as any).maxTouchPoints ?? 0);
      if (isMobileUa && maxTouchPoints === 0) {
        signals.push('mobile_ua_no_touch');
      }
    } catch (error) {
      signals.push('touchpoints_unavailable');
    }

    if (signals.length === 0) {
      signals.push('no_anti_fingerprint_anomalies');
    }

    if (typeof window !== 'undefined' && typeof console !== 'undefined') {
      console.info('[AIDetector] anti-fingerprint signals', signals);
    }

    return signals;
  }
}
