# DDT PIANO

> 두근두근타운 피아노 입력기

3옥타브 대역의 러프한 미디트랙 어레인지와 키보드 자동입력을 위해 시작되었습니다.

## 개발 가이드

### via npm

```bash
> pwd
ddt-piano

# 개발버전 실행
> npm run tauri:dev

# 빌드
> npm run tauri:build
```

보통은 이 방법으로 node 와 tauri 를 한번에 실행할 수 있습니다.

이러한 방식으로 문제가 없다면 아래의 내용은 읽지 않아도 됩니다.

### backend (tauri)

> tauri + rust

프로젝트 관리에 cargo 사용합니다

tauri 애플리케이션을 독립적으로 실행하려면 아래의 내용을 확인해주세요

```bash
> pwd
ddt-piano/src-tauri
```

src-tauri 디렉터리에서 작업해주세요

| 작업 분류 | 커맨드 |
| - | - |
| 패키지 설치 | cargo install <PACKAGE_NAME> |
| 빌드 | cargo build |
| 실행 | cargo run |
| 아이콘 변경 | cargo tauri icon <ICON_PATH> |
| 배포버전 빌드 | cargo build --release |

### frontend (node w. sveltekit)

> sveltekit + tailwindcss + shadcn

프로젝트 관리에 npm 사용합니다

```bash
> pwd
ddt-piano
```

프로젝트 루트경로 `ddt-piano`에서 작업해주세요

화면구성코드는 `ddt-piano/src` 디렉터리 하위에 있습니다.

| 작업 분류 | 커맨드 |
| - | - |
| 기존 패키지 내려받기 | npm install |
| 패키지 설치 | npm install <PACKAGE_NAME> |
| 빌드 | npm run build |
| 실행 | npm run dev |

## 배포 가이드

github action 으로 release 합니다.
