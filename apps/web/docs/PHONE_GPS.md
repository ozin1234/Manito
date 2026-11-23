# 휴대폰 GPS 접속

브라우저 위치 기능은 HTTPS 보안 주소와 위치 권한이 있어야 동작합니다. PC의 `http://127.0.0.1:5173/`은 **PC에서만** 접속하는 주소입니다. 휴대폰에서 `http://192.168...` 같은 PC 내부망 주소로 열면 브라우저가 GPS를 막습니다. ChatGPT 등 앱 안 브라우저에서는 상위 앱의 위치 권한 정책 때문에 HTTPS여도 막힐 수 있습니다.

## G-ROAD를 폰에서 열기

개인용 연결로는 [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)를 사용할 수 있습니다. 이 PC와 휴대폰에 Tailscale을 설치하고 같은 개인 계정으로 로그인한 후, PC의 Tailscale에서 HTTPS 인증서를 활성화하고 `tailscale serve --bg 5173`을 실행합니다. 출력되는 `https://...ts.net/` 주소를 휴대폰 Chrome 또는 Safari의 주소창에 **직접** 엽니다. 이 URL은 두 기기가 같은 Tailscale 네트워크에 연결되어 있을 때만 접속됩니다.

이전 패키지에 포함된 `Connect-GROAD-Phone.ps1`을 실행하면 `tailscale serve --bg 5173`과 HTTPS 제보 API 확인을 한 번에 진행하고 접속 주소를 표시합니다. Tailscale의 첫 HTTPS 사용 동의 화면이 나오면 계정에서 설정을 마친 뒤 스크립트를 다시 실행하세요.

지도 오른쪽의 **내 위치 추적**을 눌러 위치 권한을 허용하세요. 제보 작성 창의 **내 위치**도 같은 권한을 사용합니다. 이미 거부했다면 휴대폰 설정에서 브라우저와 해당 사이트의 위치 권한을 허용으로 바꾸세요. GPS가 오래 걸리면 야외에서 다시 시도하세요. 앱에 오류가 나오면 현재 주소 복사 버튼을 이용해 브라우저에서 직접 열 수 있습니다.

Tailscale을 설치해도 **이 PC의 G-ROAD 웹앱과 Docker 엔진이 실행 중이어야** 합니다. 새 PC로 이전했다면 Serve 설정을 그 PC에서 다시 해야 합니다. G-ROAD는 기기가 전달한 위치·정확도 값을 표시할 뿐 휴대폰 GPS 하드웨어 정확도를 높이지는 않습니다.
