# Secrets Keep

Ứng dụng **React Native (Expo)** cho Android, iOS và Web để quản lý ghi chú bí mật dạng Markdown lưu trữ trực tiếp trong thư mục `secrets` trên **Google Drive**.

## Kiến trúc

- **Không sử dụng WebView (`0% WebView` / không `"use dom"`)**: Toàn bộ giao diện thư mục, thanh bên cây thư mục lười tải (lazy tree drawer), trình xem/soạn thảo khối Markdown phân cấp, thanh công cụ nổi ghim dưới tiêu đề (sticky block toolbar) và kéo-thả sắp xếp khối đều được xây dựng bằng các thành phần React Native thuần.
- **UI & Design System**:
  - Xây dựng trên nền **[React Native Reusables](https://www.shadcn.io/template/mrzachnugent-react-native-reusables)** (`NativeWind v4`, `@rn-primitives/*`, `class-variance-authority`, `lucide-react-native`).
  - Bảo toàn ngôn ngữ thiết kế tối giản của Secrets Keep: bảng màu giấy ấm `#f7f7f5` (Light) & đen tuyền OLED `#000000` (Dark), khung phân cấp nhánh `H1–H6`, thẻ mục viền nét đứt (`dashed`), render đầy đủ Markdown chuẩn CommonMark/GFM bằng `react-native-marked`, tô màu cú pháp khối mã cuộn ngang bằng `prism-react-renderer` và định dạng Markdown chuẩn qua `prettier`.
- **Quản lý trạng thái & đồng bộ**: `@tanstack/react-query` + `zustand` + `@react-native-async-storage/async-storage` (lưu đệm cục bộ, làm mới nền sau 30 giây, hàng đợi lưu tuần tự từng tệp kèm khôi phục tự động nếu lỗi mạng).
- **Đăng nhập & xác thực Google Drive (giữ nguyên phương thức gốc)**:
  - **Android Native**: `@react-native-google-signin/google-signin` (`org.starfallorb.secretskeep`, `google-services.json`, phạm vi `https://www.googleapis.com/auth/drive`), tự động khôi phục phiên và làm mới access token ngầm qua Google Play Services mà không cần backend hay client secret; tự xóa cache token và thử lại khi gặp `401`.
  - **Web**: `firebase/auth` giữ nguyên luồng OAuth Redirect Bridge giữa `https://awesome-89e82.web.app` và `https://awesome-89e82.firebaseapp.com` (cùng khóa phiên `secret-keep.google-session`), hỗ trợ đăng nhập popup khi chạy trên domain phát triển khác và chế độ `/?demo=1`.

## Phát triển & Kiểm thử

```sh
npm install
cp .env.example .env

# Chạy máy chủ phát triển Expo
npm start
npm run web
npm run android

# Kiểm tra kiểu TypeScript & chạy bộ test tự động
npm run typecheck
npm test

# Xuất bản Web SPA (dist/) tương thích Firebase Hosting
npm run build

# Xuất bundle Android production
npm run export:android

# Build APK Android qua EAS (tách APK theo từng ABI)
npm run build:android
```
