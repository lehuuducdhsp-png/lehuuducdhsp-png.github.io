# Lớp học Thầy Đức

Trang quản lý lớp học dành cho giáo viên, gồm học sinh, lịch học nhiều tuần, thời khóa biểu tổng quan và lịch riêng từng học sinh, điểm danh theo từng tab học sinh, bảng điểm, bài tập, học phí và báo cáo phụ huynh.

Lịch học được lưu theo ngày cụ thể và dùng chung cho mọi màn hình. Có thể chuyển tuần, nhân lịch sang tuần kế tiếp, chọn giờ từ 00:00 đến 23:59, in/lưu PDF hoặc sao chép lịch riêng để gửi học sinh. Hồ sơ từng học sinh hiển thị đầy đủ các buổi đã học, nghỉ và tính phí.

Phần học phí có sổ giao dịch đã thu, công nợ, tiền dư, chu kỳ thu tự động theo `số buổi/tuần × 4`, chu kỳ chỉnh riêng từng học sinh, ngày dự kiến thu tiếp theo và doanh thu dự kiến từ lịch tương lai đã xếp.

Hồ sơ học sinh dùng trạng thái xanh cho đang học, đỏ cho đã nghỉ. Khi xóa một học sinh, hệ thống yêu cầu xác nhận và dọn toàn bộ lịch, điểm danh, điểm số, bài tập và giao dịch học phí liên quan.

Trang được bảo vệ bằng Supabase Auth, chỉ tài khoản giáo viên đã được cấp quyền mới mở được bảng điều khiển. Mật khẩu không được lưu trong mã nguồn. Quên mật khẩu sử dụng liên kết dùng một lần gửi qua Gmail; đổi mật khẩu khi đang đăng nhập yêu cầu mã xác minh.

Dữ liệu nghiệp vụ được đồng bộ vào Supabase với Row Level Security, khóa phiên bản khi ghi và tối đa 100 bản lịch sử. `localStorage` chỉ là bộ nhớ ngoại tuyến trên thiết bị; người dùng có thể tắt “Thiết bị riêng” để tự xóa bản cục bộ khi đăng xuất.

Phiên bản `2026.07.16.5` bổ sung cổng học sinh tách biệt, giao diện quản lý tên đăng nhập, cấp lại mật khẩu tạm, khóa/mở tài khoản và bắt buộc học sinh đổi mật khẩu lần đầu. Dữ liệu học sinh được lọc ở Edge Function: mỗi tài khoản chỉ nhận lịch, điểm danh, điểm, bài tập và nhận xét của chính mình; không nhận học phí hoặc dữ liệu của học sinh khác.

## Kích hoạt cổng học sinh

1. Chạy toàn bộ `../supabase/student_portal.sql` trong Supabase SQL Editor.
2. Triển khai Edge Function trong `../supabase/functions/student-portal`.
3. Mở mục **Tài khoản HS** trên trang quản trị để tạo tài khoản và cấp mật khẩu tạm.

Không đưa khóa `service_role` vào mã website. Supabase chỉ sử dụng khóa này bên trong Edge Function.

Mỗi lần cập nhật mã nguồn, GitHub Actions chạy bộ kiểm thử hồi quy bằng lệnh `npm test` để kiểm tra các quy tắc an toàn quan trọng.

## Thiết lập Supabase bắt buộc

Mở **Supabase → SQL Editor → New query**, sao chép toàn bộ tệp `supabase/production_upgrade.sql`, sau đó nhấn **Run**. Kết quả thành công phải trả về trạng thái `READY`.

Tệp này thiết lập đồng thời:

- bảng dữ liệu và RLS;
- chống ghi đè giữa điện thoại và máy tính;
- 100 bản lịch sử gần nhất;
- kho tài liệu riêng tư, tối đa 50 MB mỗi tệp.

Sau khi chạy SQL, đăng nhập website và kiểm tra **Cài đặt → Dữ liệu lớp học** phải xuất hiện số `bản` lớn hơn 0.
