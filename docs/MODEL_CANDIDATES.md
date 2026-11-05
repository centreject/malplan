# 로컬 AI 모델 교체 후보와 비교 시험 계획

작성 2026-11-05. 모델 파일은 받지 않았고, 측정도 하지 않았습니다. 시험은 사용자 PC에서 합니다.

## 0. 조사 범위와 한계

- **확인한 공식 출처:** GitHub에 있는 Qwen 공식 저장소, llama.cpp 공식 저장소(태그 `b11565`의 소스, 문서, 채팅 템플릿), google-deepmind/gemma 저장소.
- **접속하지 못한 곳 (이 작업 환경의 네트워크 정책 때문):**
  - `huggingface.co`: 모델 카드, 파일 크기, SHA256, 가중치 라이선스 파일
  - `ai.google.dev`: Gemma 이용 약관
- **그 결과:**
  - Hugging Face에만 있는 값은 모두 **미확인**입니다.
  - 2차 기사나 검색 요약으로만 본 내용도 **미확인**으로 표시하고, 출처는 따로 적었습니다.
  - 미확인 값은 추정하지 않았습니다. 대신 2절의 1단계 명령이 사용자 PC에서 Hugging Face API로 직접 채웁니다.
- **기호:** ✅ = 공식 출처에서 원문 확인 · ⚠️ = 2차 출처뿐(미확인) · ❓ = 찾지 못함(미확인)

## 1. 후보 비교

### 1.1 현재 모델 (기준)

| 항목 | 값 | 근거 |
|---|---|---|
| 모델 | Qwen3 4B, Q4_K_M | `src-tauri/src/llm_server.rs` `MODEL_FILE` |
| 받는 곳 | `Qwen/Qwen3-4B-GGUF` (Qwen 공식 GGUF) | `src-tauri/src/model_download.rs` `MODEL_URL` |
| 크기 / SHA256 | 2,497,280,256 B / `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` | `model_download.rs` (받은 뒤 앱이 검증) |
| 실행 옵션 | `--host 127.0.0.1 --port 8357 -c 2048 -np 1 --jinja --chat-template-kwargs {"enable_thinking":false}`, 스레드는 기본값 | `llm_server.rs` |
| 성능 | 응답 중앙값 약 2.8초(Ryzen 5600X), 검증 90문장 전체 92%, 분류 78/90 | `docs/PLAN.md` 5단계 |

### 1.2 후보 표

| 후보 | 공식 가중치 | GGUF 제공자 (Q4_K_M) | 제공자 신뢰도 | Q4_K_M 크기 · SHA256 | 라이선스 (앱 배포 조건) | b11565 실행 | 생각 모드 끄기 | JSON schema 응답 |
|---|---|---|---|---|---|---|---|---|
| **Qwen3.5 4B** | Qwen이 HF Hub에 공개 ✅[Q1]. 정확한 저장소 이름 ❓ | `unsloth/Qwen3.5-4B-GGUF` (llama.cpp 문서의 예시 ✅[L4]). Qwen 공식 GGUF 여부 ❓ | 중: 제3자(Unsloth). 공식 가중치를 llama.cpp로 직접 변환하는 대안 있음(5절) | ❓ | 코드 저장소는 Apache-2.0. 가중치는 "HF/ModelScope의 라이선스 파일을 보라" ✅[Q1]. 가중치 라이선스 ❓ | 아키텍처 `qwen35` 있음 ✅[L1]. 실제 실행 ❓ | `enable_thinking:false` → 빈 `<think></think>` 삽입, 지정 안 하면 **생각 켜짐** ✅[L5] | 서버 기능, 모델 무관 ✅[L2] |
| Qwen3.5 2B (참고: 속도) | 위와 같음 ✅[Q1] | ❓ | ❓ | ❓ | 위와 같음 | `qwen35` ✅[L1] | 4B와 같은 계열. 템플릿 직접 확인 ❓ | ✅[L2] |
| Qwen3.5 9B (참고: 정확도 상한) | 위와 같음 ✅[Q1] | ❓ | ❓ | ❓ | 위와 같음 | `qwen35` ✅[L1] | 4B와 같은 계열. 템플릿 직접 확인 ❓ | ✅[L2] |
| **Gemma 4 E4B** | ❓ | `ggml-org/gemma-4-E4B-it-GGUF` ✅[L3] | 높음: llama.cpp 관리 조직, llama.cpp 공식 문서가 안내 | ❓ | Apache 2.0이라는 보도만 있음 ⚠️[S1–S3] | `gemma4` 있음 ✅[L1]. 실제 실행 ❓ | 31B 템플릿 사본 기준 **기본 꺼짐** ✅[L6]. E4B 내장 템플릿 ❓ | ✅[L2] |
| **Gemma 4 E2B** | ❓ | `ggml-org/gemma-4-E2B-it-GGUF` ✅[L3] | 높음: 위와 같음 | ❓ | 위와 같음 ⚠️ | `gemma4` ✅[L1] | 위와 같음 | ✅[L2] |
| **Gemma 3 4B** | ❓ | `ggml-org/gemma-3-4b-it-GGUF` ✅[L3] | 높음: 위와 같음 | 2.49 GB라는 검색 요약만 있음 ⚠️[S4] | Gemma 이용 약관 원문 확인 못함 ❓ | `gemma3` ✅[L1] | b11565에 템플릿 사본 없음 ❓ | ✅[L2] |

### 1.3 공통 항목

| 항목 | 내용 |
|---|---|
| 필요한 메모리 | **모든 후보 미확인.** 공식 수치를 찾지 못했습니다. 크기에서 추정하지 않고 2절 5단계에서 실제로 잽니다. |
| 한국어 성능 근거 | Qwen3.5: "201 languages and dialects" ✅[Q1]. 한국어만 따로 다룬 공식 수치는 ❓. Gemma 4: "140 languages"는 보도뿐 ⚠️[S2]. Gemma 3: ❓. **결국 이 앱의 한국어 문장 90개 벤치가 유일한 판단 근거입니다.** |
| 텍스트 전용으로 쓸 때 | Qwen3.5는 멀티모달 조기 융합(early fusion)으로 학습했고 ✅[Q1], 텍스트만 쓰는 경로도 공식 언급이 있습니다("mlx-lm (text-only)") ✅[Q1]. llama.cpp는 이미지 처리 부분을 `--mmproj` 파일로 따로 받으므로 ✅[L2][L3], 본 GGUF 하나만 쓰면 텍스트 전용입니다. 텍스트 전용일 때 품질이 달라지는지는 ❓. Gemma 4 E2B/E4B의 오디오·이미지 입력은 보도뿐입니다 ⚠️[S1]. |
| Qwen 3.6~3.8의 작은 모델 | **없음.** 공식 README가 밝힌 모델은 Qwen3.6-35B-A3B, Qwen3.6-27B, Qwen3.8-27B, Qwen3.8-2.4T-A95B뿐이고, 0.8B/2B/4B/9B는 Qwen3.5에만 있습니다 ✅[Q1]. `QwenLM/Qwen3.8-Flash-Next` 저장소도 있지만 크기는 ❓[Q2]. |
| llama.cpp b11565 | 태그 커밋 `f9a95aeb2096d0c0218e0cd6e6d901cd37be798a`, 10월 12일 게시 ✅[L7]. 소스에 `qwen35`, `gemma3`, `gemma3n`, `gemma4` 아키텍처가 있습니다 ✅[L1]. 실제 실행 여부는 2절 3단계에서 확인합니다. 안 되면 더 높은 llama.cpp가 필요하고, 그건 앱 변경(별도 작업)입니다. |
| JSON schema | llama-server 기능입니다: `/v1/chat/completions`의 `response_format`과 "Schema-constrained JSON response format" ✅[L2]. 앱은 이미 스키마를 보내므로(`chatBody`), 모델을 바꿔도 같은 방식이 적용됩니다. 생각 모드가 켜져 있으면 생각 글이 먼저 나오므로 반드시 꺼야 합니다. |

## 2. 사용자 PC에서 할 일 (PowerShell)

### 2.1 측정 순서와 이유

| 순서 | 모델 | 이유 |
|---|---|---|
| 1 | Qwen3 4B (현재) 재측정 | 같은 PC, 같은 날의 기준값 |
| 2 | Qwen3.5 4B | 같은 계열이고 생각 끄는 옵션이 현재와 같아서, 앱 변경이 가장 작음 |
| 3 | Gemma 4 E4B | 다른 계열 중 유력 후보. ggml-org GGUF |
| 4 | Gemma 4 E2B | 속도와 메모리가 더 가벼운지 |
| 5 | Qwen3.5 2B | 속도 참고 |
| 6 | Gemma 3 4B | 이전 세대. Gemma 4가 안 될 때의 대안 |
| 7 | Qwen3.5 9B | 정확도 상한 참고. 크기 때문에 채택 가능성은 낮음 |

### 2.2 준비 (한 번만)

```powershell
cd C:\path\to\malplan
npm ci
npm run fetch:llama
$exe = Resolve-Path .\src-tauri\binaries\llama\llama-server.exe
$dir = "$env:USERPROFILE\malplan-models"
New-Item -ItemType Directory -Force $dir | Out-Null
```

### 2.3 1단계: 받을 파일, 크기, SHA256 확인 (미확인 값 채우기)

한 후보마다 `$repo`를 바꿔 실행합니다. Qwen3.5 4B를 예로 들면:

```powershell
$repo = "unsloth/Qwen3.5-4B-GGUF"
$tree = Invoke-RestMethod "https://huggingface.co/api/models/$repo/tree/main"
$tree | Where-Object { $_.path -like "*.gguf" } | Select-Object path, @{n="GB";e={[math]::Round($_.size/1e9,2)}}, @{n="sha256";e={$_.lfs.oid}} | Format-Table -AutoSize
```

| 후보 | `$repo` |
|---|---|
| Qwen3 4B (현재) | `Qwen/Qwen3-4B-GGUF` |
| Qwen3.5 4B / 2B / 9B | `unsloth/Qwen3.5-4B-GGUF` / `unsloth/Qwen3.5-2B-GGUF` / `unsloth/Qwen3.5-9B-GGUF` (2B·9B 저장소 이름은 4B를 보고 짐작한 것이라 ❓. 없으면 HF에서 검색) |
| Gemma 4 E4B / E2B | `ggml-org/gemma-4-E4B-it-GGUF` / `ggml-org/gemma-4-E2B-it-GGUF` |
| Gemma 3 4B | `ggml-org/gemma-3-4b-it-GGUF` |

- 이 표의 `GB`와 `sha256`을 3절 결과표에 옮깁니다.
- `mmproj-*.gguf`는 이미지용이라 받지 않습니다.
- 401/403이 나오면 그 저장소는 로그인과 약관 동의가 필요한 곳입니다. 라이선스 확인 항목에 그대로 적어 두세요.

같은 단계에서 모델 카드의 라이선스도 확인합니다.

```powershell
(Invoke-RestMethod "https://huggingface.co/api/models/$repo").cardData.license
```

### 2.4 2단계: 받기와 검증

```powershell
$file = ($tree | Where-Object { $_.path -like "*Q4_K_M*.gguf" } | Select-Object -First 1)
curl.exe -L -C - -o "$dir\$($file.path)" "https://huggingface.co/$repo/resolve/main/$($file.path)"
$hash = (Get-FileHash "$dir\$($file.path)" -Algorithm SHA256).Hash.ToLower()
if ($hash -eq $file.lfs.oid) { "SHA256 일치" } else { "SHA256 불일치: 지우고 다시 받기" }
```

`-C -`를 주면 끊겼을 때 이어받습니다.

### 2.5 3단계: 서버 실행 (앱과 같은 옵션)

8357 포트는 앱이 쓰므로 **앱을 완전히 종료**하고 실행합니다(트레이 아이콘 → 종료).

```powershell
# PowerShell 7.3 이상
& $exe -m "$dir\$($file.path)" --host 127.0.0.1 --port 8357 -c 2048 -np 1 --jinja --chat-template-kwargs '{"enable_thinking":false}'
```

```powershell
# Windows PowerShell 5.1 (따옴표 처리 차이)
& $exe -m "$dir\$($file.path)" --host 127.0.0.1 --port 8357 -c 2048 -np 1 --jinja --chat-template-kwargs '{\"enable_thinking\":false}'
```

- 시작 로그에 `unknown model architecture` 같은 오류가 나오면 b11565로는 실행할 수 없는 모델입니다. 결과표에 "b11565 불가"로 적고 다음 후보로 넘어갑니다.
- 다른 PowerShell 창에서 생각 모드가 꺼졌는지와 JSON 응답을 확인합니다. 응답에 `<think>`나 `thought`가 보이면 생각 모드가 켜진 것이니 결과표에 적습니다.

```powershell
$body = '{"model":"local","temperature":0,"messages":[{"role":"user","content":"내일 오후 3시 강남역에서 민수랑 저녁 약속. JSON으로 title, kind만."}]}'
Measure-Command { $r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8357/v1/chat/completions -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) } | Select-Object TotalSeconds
$r.choices[0].message.content
```

### 2.6 4단계: 벤치 실행

다른 PowerShell 창에서 실행합니다. 개발용 60문장과 검증용 90문장을 둘 다 잽니다.

```powershell
cd C:\path\to\malplan
$name = "qwen3.5-4b"
npm run bench:llm 2>&1 | Tee-Object -FilePath "$env:USERPROFILE\malplan-models\bench-$name.txt"
```

- 결과의 `app` 행(AI + 규칙, 앱이 실제로 보여 주는 값)을 씁니다.
- 각 표의 `total`과 `category` 칸, 그리고 `median` 시간을 3절 결과표에 옮깁니다.
- 첫 응답 시간(`first`)도 적습니다.

### 2.7 5단계: 메모리 측정과 종료

벤치가 끝난 직후, 서버를 끄기 전에 실행합니다.

```powershell
Get-Process llama-server | Select-Object @{n="현재MB";e={[math]::Round($_.WorkingSet64/1MB)}}, @{n="최대MB";e={[math]::Round($_.PeakWorkingSet64/1MB)}}
Stop-Process -Name llama-server
```

## 3. 결과표 (측정 후 채우기)

| 모델 | Q4_K_M 크기 | SHA256 일치 | 가중치 라이선스 | b11565 실행 | 생각 꺼짐 | 개발용 전체 | 검증용 전체 | 검증 분류 | 응답 중앙값 | 첫 응답 | 최대 메모리 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Qwen3 4B (기준) | 2.50 GB | | Apache 2.0 | ✅ | ✅ | | | | | | |
| Qwen3.5 4B | | | | | | | | | | | |
| Gemma 4 E4B | | | | | | | | | | | |
| Gemma 4 E2B | | | | | | | | | | | |
| Qwen3.5 2B | | | | | | | | | | | |
| Gemma 3 4B | | | | | | | | | | | |
| Qwen3.5 9B | | | | | | | | | | | |

## 4. 채택 기준 (제안)

모든 비교는 **같은 PC, 같은 날 재측정한 Qwen3 4B 기준값**에 대해 합니다.

| # | 기준 | 값 |
|---|---|---|
| 1 | 검증용 전체 정확도 | 기준보다 **높을 것** (지금 기록 92%) |
| 2 | 검증용 필드별 | 분류, 종류, 제목, 장소 모두 기준보다 2문장 넘게 나빠지지 않을 것 |
| 3 | 응답 중앙값 | 기준의 1.25배 이하 (5600X에서 약 3.5초) |
| 4 | 최대 메모리 | 기준 측정값의 1.3배 이하 |
| 5 | 받는 크기 | 3.5 GB 이하 (첫 실행 다운로드 부담) |
| 6 | JSON | 150문장 중 읽지 못한 응답 0개 (`bench:llm`의 `model` 행과 `app` 행이 크게 다르면 읽기 실패를 의심) |
| 7 | 생각 모드 | 앱과 같은 옵션으로 생각 출력이 없을 것 |
| 8 | 실행기 | llama.cpp b11565 그대로 실행될 것. 업그레이드가 필요하면 그 작업을 함께 계획 |
| 9 | 라이선스 | 가중치 라이선스 원문을 확인할 것. 앱은 모델을 동봉하지 않고 첫 실행 때 받게 하므로, 그 방식에 필요한 고지(라이선스 링크, 이용 제한 전달 등)를 정리할 것 |
| 10 | 받을 파일의 출처 | 공식 또는 llama.cpp 관리 조직(ggml-org)이 올린 것. 제3자 GGUF라면 공식 가중치에서 직접 변환해 SHA256을 고정하는 방법을 검토 |

- **조건:** 1~8을 모두 만족하는 후보가 둘 이상이면, 검증용 전체가 더 높은 쪽을 고릅니다. 같으면 더 빠른 쪽입니다.
- **채택 뒤 할 일 (이번 범위 밖):**
  - `llm_server.rs`의 `MODEL_FILE`과 `model_download.rs`의 URL·크기·SHA256 변경
  - 화면의 모델 안내 문구 변경
  - `docs/PLAN.md` 기록
- **주의:** 검증용 문장을 모델 선택에 쓰면, 그 문장들은 이후 측정에서 조금 오염됩니다. 결정한 뒤에는 새 검증 문장을 늘리는 것을 권합니다.

## 5. 참고: 공식 가중치에서 직접 변환하기 (제3자 GGUF를 피할 때)

llama.cpp 저장소의 `convert_hf_to_gguf.py`와 `llama-quantize`로 공식 가중치를 Q4_K_M로 만듭니다. Python 환경과 원본 가중치(4B 기준 수 GB) 다운로드가 필요하므로, 이번 계획에서는 선택 사항으로 둡니다.

## 6. 출처

**공식 (원문 확인)**
- [Q1] Qwen 공식 README. `https://github.com/QwenLM/Qwen3.5`가 [github.com/QwenLM/Qwen3.8](https://github.com/QwenLM/Qwen3.8)로 넘어감. News: 2026-03-02에 Qwen3.5-9B/4B/2B/0.8B 공개. Qwen3.6·3.8 모델 목록, "201 languages and dialects", 라이선스 안내.
- [Q2] [QwenLM 조직의 저장소 목록](https://github.com/QwenLM) (Qwen3.8-Flash-Next 저장소 확인)
- [L1] [llama.cpp b11565 `src/llama-arch.cpp`](https://github.com/ggml-org/llama.cpp/blob/b11565/src/llama-arch.cpp): `qwen35`, `gemma3`, `gemma3n`, `gemma4`
- [L2] [llama.cpp b11565 `tools/server/README.md`](https://github.com/ggml-org/llama.cpp/blob/b11565/tools/server/README.md): `--chat-template-kwargs`, `--reasoning-budget`, `--mmproj`, schema 제약 JSON 응답
- [L3] [llama.cpp b11565 `docs/multimodal.md`](https://github.com/ggml-org/llama.cpp/blob/b11565/docs/multimodal.md): `ggml-org/gemma-3-4b-it-GGUF`, `ggml-org/gemma-4-E2B-it-GGUF`, `ggml-org/gemma-4-E4B-it-GGUF`
- [L4] [llama.cpp b11565 `docs/preset.md`](https://github.com/ggml-org/llama.cpp/blob/b11565/docs/preset.md): `hf = unsloth/Qwen3.5-4B-GGUF:Q4_K_M`
- [L5] [llama.cpp b11565 `models/templates/Qwen3.5-4B.jinja`](https://github.com/ggml-org/llama.cpp/blob/b11565/models/templates/Qwen3.5-4B.jinja): `enable_thinking` 처리
- [L6] [llama.cpp b11565 `models/templates/google-gemma-4-31B-it.jinja`](https://github.com/ggml-org/llama.cpp/blob/b11565/models/templates/google-gemma-4-31B-it.jinja): 생각 모드 기본 꺼짐
- [L7] [llama.cpp 릴리스 b11565](https://github.com/ggml-org/llama.cpp/releases/tag/b11565)
- [G1] [google-deepmind/gemma](https://github.com/google-deepmind/gemma): Gemma 2·3·3n·4를 지원하는 라이브러리. 저장소 코드는 Apache-2.0이며, 가중치 라이선스와는 별개입니다.

**2차 (미확인 표시의 근거)**
- [S1] [SiliconANGLE, 2026-04-02](https://siliconangle.com/?p=737125): Gemma 4 공개
- [S2] [Geo TV](https://www.geo.tv/latest/658294-google-launches-gemma-4-open-models-with-140-languages-400m-downloads): 140개 언어
- [S3] [Implicator](https://www.implicator.ai/google-releases-gemma-4-under-apache-2-0-dropping-its-custom-ai-license/): Apache 2.0 전환 보도
- [S4] 웹 검색 결과 요약 (`huggingface.co/ggml-org/gemma-3-4b-it-GGUF/tree/main`): Q4_K_M 2.49 GB. 원문 페이지는 열지 못했습니다.

**접속하지 못해 확인하지 못한 곳**
- `https://huggingface.co/` 전체: 모델 카드, 파일 목록, 가중치 라이선스. 2.3절 명령으로 사용자 PC에서 확인합니다.
- [Gemma 이용 약관](https://ai.google.dev/gemma/terms): Gemma 3 라이선스
