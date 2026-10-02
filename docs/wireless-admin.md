# 동구시장 가망고객 관리

- 등록: https://www.ktmns.store/wireless-consult.html
- 최초 링크 발급: https://www.ktmns.store/wireless-access.html
- 직원은 발급된 wireless-admin.html#access=... 링크로 접속하면 비밀번호 입력 없이 조회합니다.
- 일반 wireless-admin.html 주소에서는 고객 정보가 표시되지 않습니다.

최초 발급 시 기존 Google Sheets 관리자 비밀번호를 한 번 확인합니다. 비밀번호는 서버에서 AES-256-GCM으로 암호화되고 90일간 유효한 조회 전용 링크가 발급됩니다. 암호화 키는 서버 환경변수 WIRELESS_LINK_SECRET 또는 기존 TELEGRAM_BOT_TOKEN에서 HKDF로 분리합니다. 암호문은 URL fragment에 두어 정적 서버 요청이나 Referer에 포함되지 않으며, API POST 본문으로만 전달합니다. 비밀번호, 링크, 고객 목록을 브라우저 저장소에 저장하지 않습니다. 발급 결과나 요청 본문을 로그에 남기지 마세요.

링크를 가진 사람은 동구시장 고객 목록을 조회할 수 있으므로 담당 직원에게만 공유합니다. API는 링크를 검증한 뒤 기존 Sheets 인증을 거쳐 동구시장 무선 상담만 반환합니다. 링크로 기존 관리자 기능이나 수정·삭제 API를 실행할 수 없습니다. WIRELESS_LINK_VERSION을 새로운 값으로 변경하고 재배포하면 기존 링크가 모두 폐기됩니다(기본값 1). WIRELESS_LINK_SECRET 변경 또는 기존 Sheets 비밀번호 변경도 링크를 폐기합니다. 링크 폐기 목적으로 텔레그램 봇 토큰을 바꾸지 마세요.

등록은 기존 /api/consult → Google Sheets create 흐름을 그대로 사용합니다. 텔레그램 수신처 -5350656846도 유지합니다. 새 저장소 설정은 필요하지 않습니다. 기존 message 라벨에서 복지할인·요금·메모를 추출하여 이전 기록도 표시합니다. 삭제되었거나 텔레그램으로만 전달된 기록은 복원하지 않습니다.

기존 접수 API는 텔레그램 전송 후 Sheets 저장을 수행합니다. 네트워크 오류 시 재등록 전에 관리 목록에서 저장 여부를 확인합니다.

배포는 GitHub Pages와 Vercel API 모두 확인합니다. node --test tests/*.test.js 는 외부 통신 없이 링크 발급·암호화·위변조·만료·폐기·권한 분리·저장 및 알림 회귀를 검증합니다. 운영 링크 발급은 기존 관리자 비밀번호를 가진 담당자가 발급 화면에서 수행합니다.
