const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '..', 'tuition-poster.js'), 'utf8');

function createStudentListApp() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <section id="students">
      <div class="page-head"><div><h2>Học sinh</h2></div><div class="toolbar"><div class="search"><input id="studentSearch"></div></div></div>
      <div class="student-grid" id="studentGrid"></div>
    </section>
  </body></html>`, {
    url: 'https://lehuuducdhsp-png.github.io/?student-list-test=1',
    runScripts: 'dangerously'
  });
  const { window } = dom;
  window.renderStudents = () => {};
  window.db = {
    students: [
      { id:'s3', name:'NGỌC TRÂM', full:'NGUYỄN THỊ NGỌC TRÂM', grade:6, fee:150000, status:'inactive', subjects:'KHTN, Toán' },
      { id:'s2', name:'HỮU ĐỨC', full:'PHẠM HỮU ĐỨC', grade:9, fee:175000, status:'active', subjects:'HÓA HỌC' },
      { id:'s1', name:'BẢO AN', full:'NGUYỄN ĐÌNH BẢO AN', grade:9, fee:150000, status:'active', subjects:'KHTN, Toán' }
    ]
  };
  window.studentExtendedProfile = id => {
    const item = window.db.students.find(student => student.id === id);
    return { fullName:item.full, school:'Chưa điền', gradeText:String(item.grade), avatarUrl:'' };
  };
  window.feeRows = () => window.db.students.map(item => ({ id:item.id, sessions:item.status === 'active' ? 5 : 0 }));
  window.fillStudentSelects = () => {};
  window.money = value => `${Number(value).toLocaleString('vi-VN')}đ`;
  window.esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.eval(script);
  return { dom, window };
}

test('danh sách học sinh tách đang học và đã nghỉ, nhóm đã nghỉ thu gọn mặc định', () => {
  const { dom, window } = createStudentListApp();
  const groups = [...window.document.querySelectorAll('#studentGrid > .student-group')];
  assert.equal(groups.length, 2);
  assert.match(groups[0].textContent, /Đang học/);
  assert.match(groups[1].textContent, /Đã nghỉ/);
  assert.equal(groups[1].classList.contains('collapsed'), true);
  assert.equal(window.document.querySelector('[data-student-count="all"]').textContent, '3');
  assert.equal(window.document.querySelector('[data-student-count="active"]').textContent, '2');
  assert.equal(window.document.querySelector('[data-student-count="inactive"]').textContent, '1');
  const activeNames = [...groups[0].querySelectorAll('.student-card h3')].map(node => node.textContent);
  assert.deepEqual(activeNames, ['NGUYỄN ĐÌNH BẢO AN', 'PHẠM HỮU ĐỨC']);
  dom.window.close();
});

test('lọc học sinh đã nghỉ và tìm kiếm không dấu hoạt động đúng', () => {
  const { dom, window } = createStudentListApp();
  window.document.querySelector('[data-student-filter="inactive"]').click();
  let cards = [...window.document.querySelectorAll('#studentGrid .student-card h3')].map(node => node.textContent);
  assert.deepEqual(cards, ['NGUYỄN THỊ NGỌC TRÂM']);
  assert.equal(window.document.querySelector('#studentGrid .student-group').classList.contains('collapsed'), false);
  window.document.querySelector('#studentSearch').value = 'tram';
  window.renderStudents();
  cards = [...window.document.querySelectorAll('#studentGrid .student-card h3')].map(node => node.textContent);
  assert.deepEqual(cards, ['NGUYỄN THỊ NGỌC TRÂM']);
  dom.window.close();
});
