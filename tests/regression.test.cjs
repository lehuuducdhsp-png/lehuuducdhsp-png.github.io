const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const sourcePath = path.join(__dirname, '..', 'index.html');
const studentSourcePath = path.join(__dirname, '..', 'student', 'index.html');
const edgeFunctionPath = path.join(__dirname, '..', '..', 'supabase', 'functions', 'student-portal', 'index.ts');
const studentSqlPath = path.join(__dirname, '..', '..', 'supabase', 'student_portal.sql');
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
  const firstCell = window.document.querySelector('#scheduleTable tr td:nth-child(2)');
  assert.equal(headers[1], 'STT');
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
    url: 'https://lehuuducdhsp-png.github.io/student/?teacher-preview=1',
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
  assert.match(teacher, /action:'preview_student'/);
  assert.match(student, /TEACHER_PREVIEW/);
  assert.match(student, /duc-teacher-preview-data/);
  assert.match(edge, /action === 'preview_student'/);
  assert.match(edge, /teacher_preview_student/);
  assert.doesNotMatch(edge.match(/if \(action === 'preview_student'\)[\s\S]*?\n  }/)?.[0] || '', /updateUserById|password/);
});

function addSecondStudent(window) {
  window.eval(`
    db.students.push({id:'s2',name:'NGỌC TRÂM',full:'NGỌC TRÂM',grade:6,fee:150000,status:'active',subjects:'KHTN',mode:'1:1'});
    db.schedules.push({id:'sch2',student:'s2',date:'2026-07-07',weekStart:'2026-07-06',day:3,time:'17:30–19:00',subject:'Vật lý 6',mode:'Trực tiếp'});
    db.attendance.push({id:'att2',scheduleId:'sch2',student:'s2',date:'2026-07-07',time:'17:30',subject:'Vật lý 6',status:'present',charged:true,unitFee:150000});
    db.scores.push({id:'score1',student:'s1',type:'BTVN',subject:'Hóa học 9',date:'2026-07-06',score:8,weight:1},{id:'score2',student:'s2',type:'BTVN',subject:'Vật lý 6',date:'2026-07-07',score:9,weight:1});
    db.assignments.push({id:'as1',student:'s1',subject:'Hóa học 9',title:'Bài của An',note:'',due:'2026-07-10',status:'new'},{id:'as2',student:'s2',subject:'Vật lý 6',title:'Bài của Trâm',note:'',due:'2026-07-11',status:'new'});
    renderAll();
  `);
}

test('điểm danh có STT và thanh chọn học sinh thay cho danh sách nút dài', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  addSecondStudent(window);
  const headers = [...window.document.querySelectorAll('#attendance thead th')].map(item => item.textContent.trim());
  assert.equal(headers[1], 'STT');
  assert.equal(window.document.querySelector('#attendanceTable tr td:nth-child(2)').textContent.trim(), '1');
  assert.equal(window.document.querySelectorAll('#attendanceStudentFilterSelect option').length, 3);
  window.eval("setAttendanceFilter('s2')");
  assert.match(window.document.querySelector('#attendanceTable').textContent, /NGỌC TRÂM/);
  assert.doesNotMatch(window.document.querySelector('#attendanceTable').textContent, /BẢO AN/);
  dom.window.close();
});

test('bảng điểm và bài tập lọc được theo một học sinh', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  addSecondStudent(window);
  window.eval("setSectionStudentFilter('scores','s2')");
  assert.match(window.document.querySelector('#scoreTable').textContent, /NGỌC TRÂM/);
  assert.doesNotMatch(window.document.querySelector('#scoreTable').textContent, /BẢO AN/);
  assert.match(window.document.querySelector('#scoreSummary').textContent, /NGỌC TRÂM/);
  window.eval("setSectionStudentFilter('assignments','s2')");
  assert.match(window.document.querySelector('#assignmentGrid').textContent, /Bài của Trâm/);
  assert.doesNotMatch(window.document.querySelector('#assignmentGrid').textContent, /Bài của An/);
  dom.window.close();
});

test('công nợ lọc được theo học sinh nhưng tổng toàn lớp vẫn giữ nguyên', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  addSecondStudent(window);
  const totalBefore = window.document.querySelector('#feeTotal').textContent;
  window.eval("setSectionStudentFilter('tuition','s2')");
  assert.match(window.document.querySelector('#tuitionTable').textContent, /NGỌC TRÂM/);
  assert.doesNotMatch(window.document.querySelector('#tuitionTable').textContent, /BẢO AN/);
  assert.equal(window.document.querySelector('#feeTotal').textContent, totalBefore);
  dom.window.close();
});

test('đồng bộ nhiều trình duyệt có Realtime và cơ chế kiểm tra lại 20 giây', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /postgres_changes/);
  assert.match(source, /startCloudRealtime\(\)/);
  assert.match(source, /loadCloudState\(\{force:true\}\)/);
  assert.match(source, /},20000\);/);
});

test('lịch học lọc theo học sinh và xóa hàng loạt đúng các dòng đang hiển thị', async () => {
  const { dom, window } = await createApp();
  seed(window, { payment: false });
  addSecondStudent(window);
  assert.equal(window.document.querySelectorAll('#scheduleStudentFilterSelect option').length, 3);
  window.eval("setScheduleStudentFilter('s2')");
  const tableText = window.document.querySelector('#scheduleTable').textContent;
  assert.match(tableText, /NGỌC TRÂM/);
  assert.doesNotMatch(tableText, /BẢO AN/);
  window.eval("toggleAllItems('schedules',true); deleteSelectedItems('schedules')");
  assert.equal(window.eval("db.schedules.some(item=>item.id==='sch2')"), false);
  assert.equal(window.eval("db.attendance.some(item=>item.id==='att2')"), false);
  assert.equal(window.eval("db.schedules.some(item=>item.id==='sch1')"), true);
  assert.equal(window.eval("db.attendance.some(item=>item.id==='att1')"), true);
  dom.window.close();
});
