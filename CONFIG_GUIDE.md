# 프로젝트 설정 가이드

이 가이드는 프로젝트를 자신의 정보로 설정하는 방법을 안내합니다. 앱을 개인화하고 자신의 개발 계정으로 올바르게 빌드하려면 이 설정들을 수정하는 것이 중요합니다.

## 1. `app.json` - 핵심 애플리케이션 설정

이 파일은 Expo 프로젝트에서 가장 중요한 설정 파일입니다. 앱의 이름, 아이콘, 버전, 번들 식별자 등을 제어합니다.

-   **`expo.name`**: 앱의 표시 이름입니다.
    -   **예시**: `"name": "나의 멋진 앱"`
-   **`expo.slug`**: 앱의 URL 친화적인 이름입니다.
    -   **예시**: `"slug": "my-awesome-app"`
-   **`expo.owner`**: Expo 계정 사용자 이름입니다.
    -   **예시**: `"owner": "your-expo-username"`
-   **`expo.ios.bundleIdentifier`**: iOS 앱의 고유 식별자입니다. 역방향 도메인 이름 표기법을 따릅니다.
    -   **예시**: `"bundleIdentifier": "com.yourcompany.yourapp"`
-   **`expo.android.package`**: Android 앱의 고유 식별자입니다. 마찬가지로 역방향 도메인 이름 표기법을 따릅니다.
    -   **예시**: `"package": "com.yourcompany.yourapp"`
-   **`expo.extra.eas.projectId`**: Expo Application Services (EAS) 빌드를 위한 프로젝트 ID입니다. Expo 웹사이트의 프로젝트 페이지에서 찾을 수 있습니다.
    -   **예시**: `"projectId": "your-eas-project-id"`

## 2. `package.json` - 프로젝트 메타데이터 및 의존성

이 파일은 프로젝트의 메타데이터, 스크립트, 의존성을 정의합니다.

-   **`name`**: 프로젝트의 패키지 이름입니다. `app.json`의 `slug`와 일치시키는 것이 좋습니다.
    -   **예시**: `"name": "my-awesome-app"`
-   **`version`**: 앱의 버전입니다. `app.json`의 `version`과 동기화하는 것이 좋습니다.
    -   **예시**: `"version": "1.0.0"`
-   **`description`**: (선택 사항) 프로젝트에 대한 간단한 설명입니다.
-   **`author`**: (선택 사항) 자신의 이름이나 회사 이름입니다.

## 3. Android 설정

### `android/app/src/main/res/values/strings.xml`

이 파일은 Android 앱의 문자열 리소스를 포함합니다.

-   **`app_name`**: Android 런처에 표시될 앱의 이름입니다.
    -   **예시**: `<string name="app_name">나의 멋진 앱</string>`

### `android/app/build.gradle`

Expo가 일반적으로 이 파일을 관리하지만, 다음 설정에 대해 알고 있는 것이 좋습니다.

-   **`namespace` 및 `applicationId`**: 이 값들은 `app.json`에서 설정한 `package` 이름과 일치해야 합니다. 일반적으로 Expo가 빌드 과정에서 자동으로 처리합니다.

## 4. iOS 설정

### `ios/theApp/Info.plist`

이 파일은 iOS 앱의 설정 정보를 포함합니다.

-   **`CFBundleDisplayName`**: iOS 홈 화면에 표시될 앱의 이름입니다.
-   **`CFBundleIdentifier`**: `app.json`에서 설정한 `bundleIdentifier`와 일치해야 합니다.
-   **`CFBundleURLTypes`**: 앱이 URL 스킴을 사용하는 경우, 앱 설정에 맞게 여기를 업데이트해야 합니다.

이 가이드를 따르면 프로젝트를 자신의 것으로 만들기 위해 필요한 모든 설정을 성공적으로 업데이트할 수 있습니다.
