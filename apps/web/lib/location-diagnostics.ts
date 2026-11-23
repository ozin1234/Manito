type PolicyDocument = Document & {
  permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
  featurePolicy?: { allowsFeature: (feature: string) => boolean };
};

function isPolicyBlocked(): boolean {
  const page = document as PolicyDocument;
  const policy = page.permissionsPolicy ?? page.featurePolicy;
  return policy?.allowsFeature("geolocation") === false;
}

function isEmbedded(): boolean {
  try { return window.self !== window.top; }
  catch { return true; }
}

export function locationPreflight(): string | null {
  if (!window.isSecureContext) {
    return "현재 주소는 안전한 HTTPS 연결이 아닙니다. 휴대폰에서 PC의 http:// 주소로 열면 GPS가 차단됩니다. HTTPS 주소로 Chrome 또는 Safari에서 열어 주세요.";
  }
  if (isPolicyBlocked()) {
    return "앱 안의 브라우저가 위치 기능을 차단했습니다. 주소를 복사해 휴대폰 Chrome 또는 Safari에서 직접 열어 주세요.";
  }
  if (!("geolocation" in navigator)) {
    return "이 브라우저에서 위치 기능을 사용할 수 없습니다. Chrome 또는 Safari로 열고 휴대폰 위치 서비스를 켜 주세요.";
  }
  return null;
}

export function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === 1) {
    if (isPolicyBlocked() || isEmbedded()) {
      return "앱 안의 브라우저가 GPS를 차단했을 수 있습니다. 주소를 복사해 Chrome 또는 Safari에서 직접 열고 위치를 허용해 주세요.";
    }
    return "위치 권한이 거부되었습니다. 휴대폰 위치 서비스와 이 사이트의 위치 권한을 '허용'으로 바꿔 주세요. 앱 안 브라우저라면 Chrome 또는 Safari에서 직접 열어 주세요.";
  }
  if (error.code === 3) return "정해진 시간 안에 GPS 위치를 받지 못했습니다. 창가나 야외에서 잠시 기다린 뒤 다시 눌러 주세요.";
  return "GPS 위치를 확인할 수 없습니다. 휴대폰 위치 서비스와 네트워크 연결을 확인해 주세요.";
}
