# Lớp học Thầy Đức

Trang quản lý lớp học dành cho giáo viên, gồm học sinh, lịch học nhiều tuần, thời khóa biểu tổng quan và lịch riêng từng học sinh, điểm danh theo từng tab học sinh, bảng điểm, bài tập, học phí và báo cáo phụ huynh.

Lịch học được lưu theo ngày cụ thể và dùng chung cho mọi màn hình. Có thể chuyển tuần, nhân lịch sang tuần kế tiếp, chọn giờ từ 00:00 đến 23:59, in/lưu PDF hoặc sao chép lịch riêng để gửi học sinh. Hồ sơ từng học sinh hiển thị đầy đủ các buổi đã học, nghỉ và tính phí.

Trang được bảo vệ bằng Supabase Auth, chỉ tài khoản giáo viên đã được cấp quyền mới mở được bảng điều khiển. Mật khẩu không được lưu trong mã nguồn.

Dữ liệu nghiệp vụ hiện vẫn được lưu bằng `localStorage` trên trình duyệt. Bước tiếp theo là chuyển các bảng học sinh, lịch học, điểm danh, điểm số và học phí sang Supabase với Row Level Security.
