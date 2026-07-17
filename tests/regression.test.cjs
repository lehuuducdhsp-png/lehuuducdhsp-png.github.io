const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const sourcePath = path.join(__dirname, '..', 'index.html');
const tuitionPosterPath = path.join(__dirname, '..', 'tuition-poster.js');
const serviceWorkerPath = path.join(__dirname, '..', 'sw.js');
const studentSourcePath = path.join(__dirname, '..', 'student', 'index.html');
const edgeFunctionPath = path.join(__dirname, '..', 'supabase', 'functions', 'student-portal', 'index.ts');
const studentSqlPath = path.join(__dirname, '..', 'supabase', 'student_portal.sql');
const html = fs.readFileSync(sourcePath, 'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[\s\S]*?<\/script>/g, '');

async function createApp() {
  const messages = [];
  const dom = new JSDOM(html, {
    url: 'https://lehuuducdhsp-png.github.io/?test=1',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.alert = message => messages.push(String(message));
      window.confirm = () => true;
      window.open = () => null;
      window.scrollTo = () => {};
      window.structuredClone = global.structuredClone;
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      window.fetch = async () => ({ ok: false, json: async () => ({}) });
      Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 80));
  return { dom, window: dom.window, messages };
}

function seed(window, { payment = true } = {}) {
  window.eval(`db={
    students:[{id:'s1',name:'BẢO AN',full:'BẢO AN',grade:9,fee:150000,status:'active',subjects:'KHTN',mode:'1:1'}],
    schedules:[{id:'sch1',student:'s1',date:'2026-07-06',weekStart:'2026-07-06',day:2,time:'15:00–16:30',subject:'Hóa học 9',mode:'Trực tiếp'}],
    attendance:[{id:'att1',scheduleId:'sch1',student:'s1',date:'2026-07-06',time:'15:00',subject:'Hóa học 9',status:'present',charged:true,unitFee:150000}],
    scores:[],assignments:[],payments:{},documents:[],
    paymentTransactions:${payment ? `[{id:'p1',student:'s1',date:'2026-07-06',periodStart:'2026-07-06',periodEnd:'2026-07-12',sessions:1,amount:150000,accountingMode:'history',locked:true,lockedSessionIds:['att1'],note:''}]` : '[]'}
  }; selectedWeekStart='2026-07-06'; renderAll();`);
}

test('điểm danh hàng loạt không sửa được buổi đã khóa học phí', async () => {
  const { dom, window } = await createApp();
  seed(window);
  window.eval('openBulkAttendanceModal()');
  const checkbox = window.document.querySelector('.bulk-attendance-check');
  const status = window.document.querySelector('[data-schedule="sch1"]');
  assert.equal(checkbox.disabled, true);
  assert.equal(status.disabled, true);
  checkbox.checked = true;
  status.value = 'excused';
  window.eval('submitBulkAttendance({preventDefault(){}})');
  assert.equal(window.eval('db.attendance[0].status'), 'present');
  dom.window.close();
});

test('đơn giá buổi cũ không đổi khi sửa học phí hiện tại', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  assert.equal(window.eval('feeRows()[0].accrued'), 150000);
  window.eval('db.students[0].fee=200000');
  assert.equal(window.eval('feeRows()[0].accrued'), 150000);
  dom.window.close();
});

test('giai đoạn học phí khóa đúng từng buổi và ghi rõ giờ ngày cùng buổi học bù', async () => {
  const { dom, window } = await createApp();
  window.eval(`db={
    students:[{id:'s1',name:'BẢO AN',full:'BẢO AN',grade:9,fee:150000,status:'active',subjects:'KHTN',mode:'1:1'}],
    schedules:[
      {id:'sch1',student:'s1',date:'2026-07-06',weekStart:'2026-07-06',day:2,time:'15:00–16:30',subject:'Hóa học 9',mode:'Trực tiếp'},
      {id:'sch2',student:'s1',date:'2026-07-07',weekStart:'2026-07-06',day:3,time:'18:30–20:00',subject:'Hóa học 9',mode:'Trực tiếp'},
      {id:'sch3',student:'s1',date:'2026-07-08',weekStart:'2026-07-06',day:4,time:'10:00–11:30',subject:'Hóa học 9',mode:'Trực tiếp'}
    ],
    attendance:[
      {id:'att1',scheduleId:'sch1',student:'s1',date:'2026-07-06',time:'15:00',subject:'Hóa học 9',status:'present',charged:true,unitFee:150000},
      {id:'att2',scheduleId:'sch2',student:'s1',date:'2026-07-07',time:'18:30',subject:'Hóa học 9',status:'makeup',charged:true,unitFee:150000},
      {id:'att3',scheduleId:'sch3',student:'s1',date:'2026-07-08',time:'10:00',subject:'Hóa học 9',status:'present',charged:true,unitFee:150000}
    ],
    scores:[],assignments:[],payments:{},documents:[],
    paymentTransactions:[{id:'p1',student:'s1',date:'2026-07-08',periodStart:'2026-07-06',periodEnd:'2026-07-08',periodStartTime:'15:00',periodEndTime:'20:00',periodSessionIds:['att1','att2'],sessions:2,amount:300000,accountingMode:'history',locked:true,lockedSessionIds:['att1','att2'],note:''}]
  }; renderAll();`);
  const matchedIds = JSON.parse(window.eval(`JSON.stringify(historicalPaymentCoverage('s1').byPayment.p1.matchedIds)`));
  assert.deepEqual(matchedIds, ['att1', 'att2']);
  assert.equal(window.eval(`historicalPaymentCoverage('s1').covered.has(db.attendance[2])`), false);
  const historyText = window.document.querySelector('#paymentHistoryTable').textContent;
  assert.match(historyText, /15:00.*0?6\/0?7\/2026/s);
  assert.match(historyText, /20:00.*0?7\/0?7\/2026/s);
  assert.match(historyText, /1 buổi học bù/i);
  window.eval(`openPaymentModal('s1','p1')`);
  assert.equal(window.document.querySelectorAll('input[name="periodSession"]:checked').length, 2);
  assert.match(window.document.querySelector('#paymentSelectionSummary').textContent, /1 buổi học bù/i);
  dom.window.close();
});

test('khoản thu hiện tại lưu đúng buổi cùng giờ bắt đầu và kết thúc', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval(`openPaymentModal('s1','','current')`);
  const form = window.document.querySelector('#modalBody form');
  assert.equal(form.querySelectorAll('input[name="periodSession"]:checked').length, 1);
  window.eval(`submitPayment({preventDefault(){},target:document.querySelector('#modalBody form')},'')`);
  const payment = JSON.parse(window.eval('JSON.stringify(db.paymentTransactions[0])'));
  assert.deepEqual(payment.periodSessionIds, ['att1']);
  assert.deepEqual(payment.lockedSessionIds, []);
  assert.equal(payment.periodStart, '2026-07-06');
  assert.equal(payment.periodStartTime, '15:00');
  assert.equal(payment.periodEnd, '2026-07-06');
  assert.equal(payment.periodEndTime, '16:30');
  assert.equal(payment.sessions, 1);
  assert.equal(payment.amount, 150000);
  dom.window.close();
});

test('tạo phiếu học phí gửi phụ huynh từ đúng các buổi đã lưu', async () => {
  const teacherSource = fs.readFileSync(sourcePath, 'utf8');
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const appVersion = teacherSource.match(/APP_VERSION='([^']+)'/)?.[1];
  const posterVersion = teacherSource.match(/tuition-poster\.js\?v=([^"']+)/)?.[1];
  assert.equal(posterVersion, appVersion);
  assert.match(serviceWorker, new RegExp(`tuition-poster\\.js\\?v=${appVersion.replaceAll('.', '\\.')}`));
  const { dom, window } = await createApp();
  seed(window);
  window.eval(fs.readFileSync(tuitionPosterPath, 'utf8'));
  window.eval(`openTuitionNotice('s1','p1')`);
  assert.equal(window.document.querySelectorAll('#tuitionNoticeSessions input[name="noticeSession"]:checked').length, 1);
  const posterText = window.document.querySelector('#tuitionPosterPreview').textContent;
  assert.match(posterText, /LỊCH HỌC & HỌC PHÍ/);
  assert.match(posterText, /BẢO AN/);
  assert.match(posterText, /15h00/);
  assert.match(posterText, /150\.000đ/);
  assert.match(posterText, /Từ 15:00.*6\/7\/2026.*16:30.*6\/7\/2026/s);
  assert.match(posterText, /0362975219/);
  assert.match(window.document.querySelector('#modalBody').textContent, /Chia sẻ ảnh/);
  assert.match(window.document.querySelector('#modalBody').textContent, /Tải PNG/);
  assert.match(window.document.querySelector('#modalBody').textContent, /In \/ Lưu PDF/);
  dom.window.close();
});

test('chỉnh sửa bài tập giữ nguyên bản ghi và cập nhật đủ nội dung', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval(`db.assignments=[{
    id:'asg1',student:'s1',assignedDate:'2026-07-06',sessionId:'att1',
    subject:'Hóa học 9',due:'2026-07-20',title:'Bài cũ',status:'new',note:'Ghi chú cũ'
  }]; renderAssignments();`);
  assert.match(window.document.querySelector('#assignmentGrid').textContent, /Sửa/);
  window.eval(`editAssignment('asg1')`);
  const form = window.document.querySelector('#assignmentForm');
  assert.equal(window.document.querySelector('#modalTitle').textContent, 'Chỉnh sửa bài tập');
  form.elements.title.value = 'Hoàn thành bài 5, 6, 8';
  form.elements.note.value = 'Làm kỹ phần vận dụng';
  form.elements.due.value = '2026-07-22';
  form.elements.status.value = 'doing';
  window.eval(`submitAssignment({preventDefault(){},target:document.querySelector('#assignmentForm')},'asg1')`);
  const assignments = JSON.parse(window.eval('JSON.stringify(db.assignments)'));
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].id, 'asg1');
  assert.equal(assignments[0].title, 'Hoàn thành bài 5, 6, 8');
  assert.equal(assignments[0].note, 'Làm kỹ phần vận dụng');
  assert.equal(assignments[0].due, '2026-07-22');
  assert.equal(assignments[0].status, 'doing');
  dom.window.close();
});

test('tổng LS lưu cộng cả hồ sơ đã nghỉ và mỗi khoản chỉ cộng một lần', async () => {
  const { dom, window } = await createApp();
  seed(window);
  window.eval(`
    db.schedules.push({id:'sch2',student:'s1',date:'2026-07-07',weekStart:'2026-07-06',day:3,time:'18:30–20:00',subject:'Toán 9',mode:'Trực tiếp'});
    db.attendance.push({id:'att2',scheduleId:'sch2',student:'s1',date:'2026-07-07',time:'18:30',subject:'Toán 9',status:'present',charged:true,unitFee:200000});
    db.paymentTransactions.push({id:'p2',student:'s1',date:'2026-07-07',periodStart:'2026-07-07',periodEnd:'2026-07-07',periodStartTime:'18:30',periodEndTime:'20:00',periodSessionIds:['att2'],sessions:1,amount:200000,accountingMode:'current',locked:false,lockedSessionIds:[],note:''});
    db.students.push({id:'s2',name:'NGỌC LINH',full:'NGỌC LINH',grade:7,fee:600000,status:'inactive',subjects:'Toán',mode:'1:1'});
    db.schedules.push({id:'sch3',student:'s2',date:'2026-07-08',weekStart:'2026-07-06',day:4,time:'15:30–17:00',subject:'Toán 7',mode:'Trực tiếp'});
    db.attendance.push({id:'att3',scheduleId:'sch3',student:'s2',date:'2026-07-08',time:'15:30',subject:'Toán 7',status:'present',charged:true,unitFee:600000});
    db.paymentTransactions.push({id:'p3',student:'s2',date:'2026-07-08',periodStart:'2026-07-08',periodEnd:'2026-07-08',periodStartTime:'15:30',periodEndTime:'17:00',periodSessionIds:['att3'],sessions:1,amount:600000,accountingMode:'history',locked:true,lockedSessionIds:['att3'],note:''});
    renderTuition();
  `);
  const audit = JSON.parse(window.eval('JSON.stringify(tuitionPaymentAudit())'));
  assert.equal(audit.currentTotal, 200000);
  assert.equal(audit.historyTotal, 150000);
  assert.equal(audit.activeTotal, 350000);
  assert.equal(audit.inactiveTotal, 600000);
  assert.equal(audit.allCurrentTotal, 200000);
  assert.equal(audit.allHistoryTotal, 750000);
  assert.equal(audit.allTotal, 950000);
  assert.equal(audit.problemCount, 0);
  const totalText = window.document.querySelector('#feeTotal').textContent;
  assert.match(totalText, /TỔNG HỌC PHÍ ĐÃ PHÁT SINH TRONG HỆ THỐNG/);
  assert.match(totalText, /Đã thu đối trừ\s*200\.000đ/);
  assert.match(totalText, /Tổng LS lưu:\s*950\.000đ/);
  window.eval('openTuitionPaymentAudit()');
  const auditText = window.document.querySelector('#modalBody').textContent;
  assert.match(auditText, /200\.000đ thu hiện tại \+ 750\.000đ lịch sử khóa sổ = 950\.000đ/);
  assert.equal(window.document.querySelectorAll('#modalBody tbody tr').length, 3);
  dom.window.close();
});

test('phiếu học phí mặc định xanh lá pastel và tên dài nằm trong vùng riêng', async () => {
  const { dom, window } = await createApp();
  seed(window);
  window.eval(`db.students[0].full='NGUYỄN THỊ NGỌC TRÂM'`);
  window.eval(fs.readFileSync(tuitionPosterPath, 'utf8'));
  window.eval(`openTuitionNotice('s1','p1')`);
  const form = window.document.querySelector('#tuitionNoticeForm');
  const svg = window.document.querySelector('#tuitionPosterPreview').innerHTML;
  assert.equal(form.elements.theme.value, 'green');
  assert.match(svg, /#4f9b76/);
  assert.match(svg, /NGUYỄN THỊ NGỌC TRÂM/);
  assert.match(svg, /x1="560"/);
  dom.window.close();
});

test('phiếu học phí chọn được buổi chưa học đã có trong thời khóa biểu', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval(`
    db.attendance=[];
    db.schedules[0].date=addDaysISO(vietnamNow().date,2);
    db.schedules[0].weekStart=mondayISO(db.schedules[0].date);
  `);
  window.eval(fs.readFileSync(tuitionPosterPath, 'utf8'));
  window.eval(`openTuitionNotice('s1')`);
  const option = window.document.querySelector('#tuitionNoticeSessions input[value="schedule:sch1"]');
  assert.ok(option);
  assert.equal(option.checked, true);
  assert.equal(window.eval('db.attendance.length'), 0);
  const modalText = window.document.querySelector('#modalBody').textContent;
  const posterText = window.document.querySelector('#tuitionPosterPreview').textContent;
  assert.match(modalText, /Chưa học • Đã có trong TKB/);
  assert.match(modalText, /1 buổi chưa học đã có TKB/);
  assert.match(posterText, /LỊCH/);
  assert.match(posterText, /150\.000đ/);
  dom.window.close();
});

test('kiểm tra toàn bộ cấu trúc khoản thu và tài liệu khi nhập JSON', async () => {
  const { dom, window } = await createApp();
  const malformed = { students: [], schedules: [], attendance: [], scores: [], assignments: [], paymentTransactions: {}, documents: 'sai' };
  assert.equal(window.eval(`validClassroomData(${JSON.stringify(malformed)})`), false);
  dom.window.close();
});

test('lưu cục bộ đánh dấu bền trạng thái chưa đồng bộ', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval('save()');
  assert.equal(window.localStorage.getItem('ducCloudPending'), '1');
  assert.ok(window.localStorage.getItem('ducCloudPendingAt'));
  dom.window.close();
});

test('lịch tương lai của học sinh đã nghỉ không xuất hiện trên tổng quan', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval(`db.students[0].status='inactive'; db.attendance=[]; db.schedules[0].date=addDaysISO(vietnamNow().date,1); db.schedules[0].weekStart=mondayISO(db.schedules[0].date); renderDashboard()`);
  assert.equal(window.document.querySelector('#todaySchedule').textContent.includes('BẢO AN'), false);
  dom.window.close();
});

test('lịch học nhiều tuần có cột STT tự động', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval('renderSchedule()');
  const headers = [...window.document.querySelectorAll('#schedule thead th')].map(item => item.textContent.trim());
  const firstCell = window.document.querySelector('#scheduleTable tr td');
  assert.equal(headers[0], 'STT');
  assert.equal(firstCell.textContent.trim(), '1');
  dom.window.close();
});

test('bảng điểm có chú thích rõ mức đạt và chưa đạt', async () => {
  const { dom, window } = await createApp();
  window.eval('openScoreGuide()');
  const button = window.document.querySelector('[aria-label="Xem mức đánh giá bảng điểm"]');
  const modalText = window.document.querySelector('#modalBody').textContent;
  assert.ok(button);
  assert.match(modalText, /8,00 – 10,00/);
  assert.match(modalText, /5,00 – 6,49/);
  assert.match(modalText, /Dưới 5,00/);
  assert.match(modalText, /Chưa đạt/);
  assert.match(modalText, /điểm 0 vẫn được đưa vào phép tính/i);
  dom.window.close();
});

test('trang quản trị có khu vực quản lý tài khoản học sinh an toàn', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /id="studentAccounts"/);
  assert.match(source, /Cấp lại mật khẩu/);
  assert.match(source, /hệ thống không lưu và không hiển thị lại mật khẩu cũ/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test('cổng học sinh không hiển thị học phí hoặc khóa quản trị', () => {
  const source = fs.readFileSync(studentSourcePath, 'utf8');
  assert.match(source, /Cổng thông tin dành riêng cho học sinh/);
  assert.match(source, /storageKey:'duc-student-auth'/);
  assert.doesNotMatch(source, /unitFee|paymentTransactions|Học phí|service_role/i);
});

test('cổng học sinh ghép đúng điểm danh cũ chưa có scheduleId', async () => {
  const studentHtml = fs.readFileSync(studentSourcePath, 'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(studentHtml, {
    url: 'https://lehuuducdhsp-png.github.io/student/?test=1',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.open = () => null;
    }
  });
  dom.window.eval(`data={
    profile:{id:'s1',name:'BẢO AN',full:'BẢO AN',grade:9,subjects:'KHTN'},
    schedules:[{id:'sch-old',date:'2026-07-05',time:'18:30–20:00',subject:'Hóa học 9',mode:'Trực tiếp'}],
    attendance:[{id:'att-old',date:'2026-07-05',time:'18:30',subject:'Hóa học 9',status:'present'}],
    scores:[],assignments:[]
  }; account={username:'bao.an'}; renderAll();`);
  const rowText = dom.window.document.querySelector('#scheduleRows').textContent;
  assert.match(rowText, /Có mặt/);
  assert.doesNotMatch(rowText, /Chưa điểm danh|Chưa ghi/);
  dom.window.close();
});

test('cổng học sinh có thời khóa biểu riêng nằm giữa Tổng quan và Lịch học', () => {
  const studentHtml = fs.readFileSync(studentSourcePath, 'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(studentHtml, {
    url: 'https://lehuuducdhsp-png.github.io/student/?teacher-preview=1',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.open = () => null;
    }
  });
  dom.window.eval(`studentTimetableWeek='2026-07-13'; studentTimetableDay=2; data={
    profile:{id:'s1',name:'BẢO AN',full:'BẢO AN',grade:9,subjects:'KHTN'},
    schedules:[{id:'sch1',date:'2026-07-13',weekStart:'2026-07-13',day:2,time:'17:30–19:00',subject:'Hóa học 9',mode:'Trực tiếp'}],
    attendance:[],scores:[],assignments:[]
  }; account={username:'bao.an'}; renderAll(); showTab('timetable');`);
  const firstTabs = [...dom.window.document.querySelectorAll('#tabs [data-tab]')]
    .slice(0, 3)
    .map(item => item.textContent.trim());
  assert.deepEqual(firstTabs, ['Tổng quan', 'Thời khóa biểu', 'Lịch học']);
  assert.equal(dom.window.document.querySelector('#view-timetable').classList.contains('active'), true);
  assert.match(dom.window.document.querySelector('#studentTimetableBody').textContent, /Hóa học 9/);
  assert.match(dom.window.document.querySelector('#studentTimetableWeek').textContent, /13\/0?7\/2026/);
  assert.match(dom.window.document.querySelector('#studentTimetableSummary').textContent, /1.*Buổi học trong tuần/s);
  dom.window.close();
});

test('điện thoại có thêm bảng thời khóa biểu tuần cho cả giáo viên và học sinh', async () => {
  const teacherSource = fs.readFileSync(sourcePath, 'utf8');
  const studentSource = fs.readFileSync(studentSourcePath, 'utf8');
  assert.match(teacherSource, /Kéo ngang để xem đủ 7 ngày/);
  assert.match(teacherSource, /#timetable \.timetable-wrap\{display:block/);
  assert.doesNotMatch(teacherSource, /#timetable \.timetable-wrap\{display:none/);
  assert.match(studentSource, /Bảng chỉ có lịch của em/);
  assert.match(studentSource, /\.student-timetable-wrap\{display:block/);
  assert.doesNotMatch(studentSource, /\.student-timetable-wrap\{display:none/);

  const { dom, window } = await createApp();
  seed(window, { payment: false });
  window.eval(`document.getElementById('timetableStudent').value='s1'; renderTimetable()`);
  assert.equal(window.document.querySelectorAll('#timetableHead th').length, 8);
  assert.match(window.document.querySelector('#timetableBody').textContent, /BẢO AN/);
  assert.ok(window.document.querySelector('#timetableBody .lesson-trash'));
  assert.ok(window.document.querySelector('#timetableBody .lesson-attendance'));
  assert.ok(window.document.querySelector('#timetableBody .empty-slot'));
  dom.window.close();
});

test('Edge Function lọc dữ liệu theo đúng student_id và không trả tiền học phí', () => {
  const source = fs.readFileSync(edgeFunctionPath, 'utf8');
  assert.match(source, /item\?\.student === studentId/);
  assert.match(source, /user\.app_metadata\?\.role !== 'student'/);
  assert.match(source, /\['id', 'scheduleId', 'date', 'time', 'subject', 'status'/);
  assert.doesNotMatch(source, /fields\(item, \[[^\]]*unitFee/);
});

test('bảng tài khoản bật RLS và không cấp quyền trực tiếp cho trình duyệt', () => {
  const sql = fs.readFileSync(studentSqlPath, 'utf8');
  assert.match(sql, /student_accounts enable row level security/i);
  assert.match(sql, /revoke all on table public\.student_accounts from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.student_accounts to service_role/i);
  assert.match(sql, /grant usage, select on sequence public\.student_account_audit_id_seq to service_role/i);
  assert.match(sql, /grant select on table public\.classroom_state to service_role/i);
  assert.doesNotMatch(sql, /password\s+(text|varchar)/i);
});

test('giáo viên xem như học sinh mà không cần hoặc thay đổi mật khẩu', () => {
  const teacher = fs.readFileSync(sourcePath, 'utf8');
  const student = fs.readFileSync(studentSourcePath, 'utf8');
  const edge = fs.readFileSync(edgeFunctionPath, 'utf8');
  assert.match(teacher, /Xem như học sinh/);
  assert.match(teacher, /studentPreviewDashboard/);
  assert.match(teacher, /preview-key/);
  assert.match(teacher, /ducTeacherPreview:/);
  assert.match(student, /TEACHER_PREVIEW/);
  assert.match(student, /duc-teacher-preview-data/);
  assert.match(student, /readStoredTeacherPreview/);
  assert.match(student, /ducTeacherPreview:/);
  assert.match(edge, /action === 'preview_student'/);
  assert.match(edge, /teacher_preview_student/);
  assert.doesNotMatch(edge.match(/if \(action === 'preview_student'\)[\s\S]*?\n  }/)?.[0] || '', /updateUserById|password/);
});

test('xem như học sinh dùng dữ liệu đã lọc tại máy và không phụ thuộc Edge Function', async () => {
  const { dom, window } = await createApp();
  seed(window);
  const sent = [];
  const popup = { closed: false, postMessage(payload) { sent.push(payload); }, close() {} };
  window.open = () => popup;
  window.eval(`studentAccounts=[{studentId:'s1',username:'bao.an',status:'active'}]; openStudentPortalPreview('s1')`);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dashboard.profile.id, 's1');
  assert.equal(sent[0].account.username, 'bao.an');
  assert.equal(sent[0].dashboard.attendance.length, 1);
  assert.equal('unitFee' in sent[0].dashboard.attendance[0], false);
  assert.equal('paymentTransactions' in sent[0].dashboard, false);
  assert.equal('payments' in sent[0].dashboard, false);
  dom.window.close();
});

test('cổng học sinh trên điện thoại hiện đủ ngày tháng năm hiện tại', () => {
  const student = fs.readFileSync(studentSourcePath, 'utf8');
  const mobileBlock = student.match(/@media\(max-width:850px\)\{[\s\S]*?\n    @media\(max-width:520px\)/)?.[0] || '';
  assert.match(mobileBlock, /\.hero-mark\{display:block/);
  assert.doesNotMatch(mobileBlock, /\.hero-mark\{display:none/);
  assert.match(student, /month:'long',year:'numeric'/);
  assert.match(student, /id="heroDay"/);
  assert.match(student, /id="heroMonth"/);
});

test('xem như học sinh nhận dữ liệu dự phòng khi điện thoại cắt window.opener', async () => {
  const studentHtml = fs.readFileSync(studentSourcePath, 'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[\s\S]*?<\/script>/g, '');
  const payload = {
    createdAt: Date.now(),
    sameTab: true,
    account: { username: 'bao.an' },
    dashboard: {
      profile: { id: 's1', name: 'BẢO AN', full: 'NGUYỄN ĐÌNH BẢO AN', grade: 9, subjects: 'KHTN' },
      schedules: [], attendance: [], scores: [], assignments: []
    }
  };
  const dom = new JSDOM(studentHtml, {
    url: 'https://lehuuducdhsp-png.github.io/student/?teacher-preview=1&preview-key=mobile-test',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.localStorage.setItem('ducTeacherPreview:mobile-test', JSON.stringify(payload));
      Object.defineProperty(window, 'opener', { value: null });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.document.querySelector('#studentApp').classList.contains('hidden'), false);
  assert.match(dom.window.document.querySelector('#previewBanner').textContent, /GIÁO VIÊN XEM NHƯ HỌC SINH/);
  assert.equal(dom.window.document.querySelector('#logoutButton').textContent, 'Quay lại quản trị');
  assert.match(dom.window.document.querySelector('#studentGreeting').textContent, /BẢO AN/);
  assert.equal(dom.window.localStorage.getItem('ducTeacherPreview:mobile-test'), null);
  dom.window.close();
});
