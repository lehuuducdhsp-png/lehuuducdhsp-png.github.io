(()=>{
  const THEMES={
    blue:{primary:'#1455c0',dark:'#073b78',accent:'#ff6b21',soft:'#eaf4ff',soft2:'#d9ebff',paper:'#f7fbff',line:'#a9ccef',success:'#16a34a'},
    pink:{primary:'#ec3f7a',dark:'#7b2cbf',accent:'#ff4f8b',soft:'#fff0f5',soft2:'#ffe0ec',paper:'#fff9fb',line:'#f4b7cf',success:'#16a34a'},
    green:{primary:'#5eae7d',dark:'#236247',accent:'#8bcf99',soft:'#eff9f2',soft2:'#dff2e4',paper:'#fbfefb',line:'#b8dec3',success:'#2f9b59'}
  };
  const state={studentId:'',paymentId:''};
  const tuitionNoticeDefaults={
    phone:'0362975219',
    accountNumber:'0362975219',
    bankName:'VP Bank',
    transferTemplate:'{Học sinh} – Lớp học Thầy Đức – {số buổi} buổi',
    theme:'green'
  };
  const xml=value=>esc(String(value??''));
  const short=(value,max)=>{const text=String(value??'').trim();return text.length>max?text.slice(0,max-1).trim()+'…':text};
  const clock=value=>String(value||'').replace(':','h');
  const posterDay=value=>({2:'Thứ Hai',3:'Thứ Ba',4:'Thứ Tư',5:'Thứ Năm',6:'Thứ Sáu',7:'Thứ Bảy',8:'Chủ Nhật'})[dayCode(value)]||'';
  const fileSlug=value=>String(value||'hoc-sinh').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
  const sameIds=(left,right)=>left.length===right.length&&[...left].sort().every((id,index)=>id===[...right].sort()[index]);

  function noticePayment(paymentId=''){return paymentId?db.paymentTransactions.find(item=>item.id===paymentId):null}
  function noticeSelectedIds(){return[...document.querySelectorAll('#tuitionNoticeSessions input[name="noticeSession"]:checked')].map(input=>input.value)}
  function noticeScheduleRecord(schedule){const parts=timeRangeParts(schedule.time);return{id:`schedule:${schedule.id}`,scheduleId:schedule.id,student:schedule.student,date:schedule.date,time:parts.start,subject:schedule.subject,status:'scheduled',charged:true,unitFee:Number(student(schedule.student).fee)||0,noticeFuture:true}}
  function noticeCandidates(studentId,paymentId=''){const payment=noticePayment(paymentId);if(payment){const exact=paymentExactSessionIds(payment),ids=exact.length?exact:historicalPaymentCoverage(studentId).byPayment[payment.id]?.matchedIds||[],wanted=new Set(ids);return db.attendance.filter(item=>wanted.has(item.id)).sort(paymentRecordSort)}const learned=paymentSelectableRecords(studentId),scheduled=db.schedules.filter(item=>item.student===studentId&&!attendanceForSchedule(item)).map(noticeScheduleRecord);return[...learned,...scheduled].sort(paymentRecordSort)}
  function noticeRecordsByIds(ids){const wanted=new Set(ids);return noticeCandidates(state.studentId,state.paymentId).filter(item=>wanted.has(item.id)).sort(paymentRecordSort)}
  function noticeBounds(records,payment=null){if(records.length){const first=records[0],last=records[records.length-1],firstTime=paymentRecordTimes(first,payment),lastTime=paymentRecordTimes(last,payment);return{startDate:first.date,startTime:firstTime.start,endDate:last.date,endTime:lastTime.end,records}}return{startDate:payment?.periodStart||'',startTime:payment?.periodStartTime||'',endDate:payment?.periodEnd||'',endTime:payment?.periodEndTime||'',records:[]}}
  function noticeDefaultIds(studentId,paymentId=''){
    const payment=noticePayment(paymentId);
    if(payment){
      const exact=paymentExactSessionIds(payment);
      if(exact.length)return exact;
      return historicalPaymentCoverage(studentId).byPayment[payment.id]?.matchedIds||[];
    }
    const records=noticeCandidates(studentId),row=feeRows().find(item=>item.id===studentId),target=Math.max(1,Math.min(Number(row?.cycle)||records.length,Number(row?.unpaidSessions)||records.length));
    return records.slice(0,target).map(item=>item.id);
  }
  function noticeSessionPicker(studentId,paymentId='',selectedIds=[]){
    const selected=new Set(selectedIds),records=noticeCandidates(studentId,paymentId),locked=Boolean(noticePayment(paymentId));
    return records.length?records.map(record=>{
      const schedule=scheduleForAttendance(record),range=schedule?.time||attendanceClock(record.time),fee=Number(record.unitFee)||Number(student(studentId).fee)||0,status=record.noticeFuture?'Chưa học • Đã có trong TKB':statusLabel[record.status]||record.status;
      return `<label class="payment-session-option"><input type="checkbox" name="noticeSession" value="${esc(record.id)}" ${selected.has(record.id)?'checked':''} ${locked?'disabled':''} onchange="renderTuitionNoticePreview()"><span><b>${dateVN(record.date)} • ${esc(range)} • ${esc(record.subject)}</b><span>${locked?'ĐÃ THU • ':''}${esc(status)} • ${money(fee)}${record.status==='makeup'?' • BUỔI HỌC BÙ':''}</span></span></label>`
    }).join(''):'<div class="empty" style="padding:18px">Chưa có buổi đã học hoặc lịch sắp tới phù hợp để tạo phiếu.</div>'
  }
  function noticeSettings(form){return{phone:form.elements.phone.value.trim(),accountNumber:form.elements.accountNumber.value.trim(),bankName:form.elements.bankName.value.trim(),transferTemplate:form.elements.transferTemplate.value.trim(),theme:'green'}}
  function rememberNoticeSettings(form){db.tuitionNoticeSettings={...tuitionNoticeDefaults,...noticeSettings(form)};markCloudDirty();persistLocalDatabase();queueCloudSave()}
  function noticeData(){
    const form=document.getElementById('tuitionNoticeForm');
    if(!form)return null;
    const selectedIds=noticeSelectedIds(),records=noticeRecordsByIds(selectedIds),s=student(state.studentId),payment=noticePayment(state.paymentId),recordTotal=records.reduce((sum,item)=>sum+(Number(item.unitFee)||Number(s.fee)||0),0),amount=payment&&Number(payment.amount)>=0?Number(payment.amount):recordTotal,unit=records.length?amount/records.length:0,bounds=noticeBounds(records,payment),settings=noticeSettings(form),makeup=records.filter(item=>item.status==='makeup').length,future=records.filter(item=>item.noticeFuture).length,template=settings.transferTemplate||tuitionNoticeDefaults.transferTemplate,transferContent=template.replaceAll('{Học sinh}',s.full||s.name).replaceAll('{số buổi}',String(records.length));
    return{student:s,payment,receipt:Boolean(payment),selectedIds,records,amount,unit,bounds,settings,makeup,future,transferContent,theme:'green'}
  }
  function posterRowSvg(record,index,y,theme){
    const times=paymentRecordTimes(record),fill=index%2?'#ffffff':theme.paper,scheduled=Boolean(record.noticeFuture),status=scheduled?'LỊCH':record.status==='makeup'?'BÙ':record.status==='absent'?'PHÍ':'✓',statusSize=scheduled?12:status==='✓'?30:18,statusFill=scheduled||record.status==='makeup'?theme.accent:theme.success;
    return `<g><rect x="50" y="${y}" width="980" height="54" fill="${fill}"/><line x1="50" y1="${y+54}" x2="1030" y2="${y+54}" stroke="${theme.line}"/><text x="95" y="${y+35}" class="row stt">${index+1}</text><text x="215" y="${y+35}" class="row">${xml(dateVN(record.date).replace(/\/\d{4}$/,''))}</text><text x="380" y="${y+35}" class="row">${xml(posterDay(record.date))}</text><text x="550" y="${y+35}" class="row">${xml(clock(times.start||record.time))}</text><text x="780" y="${y+35}" class="row">${xml(short(record.subject,24))}</text><circle cx="980" cy="${y+27}" r="18" fill="${statusFill}"/><text x="980" y="${y+(status==='✓'?38:33)}" text-anchor="middle" fill="#fff" font-size="${statusSize}" font-weight="900">${status}</text></g>`
  }
  function tuitionPosterSvg(data){
    const theme=THEMES[data.theme]||THEMES.green,rowsY=496,rowHeight=54,rowsEnd=rowsY+data.records.length*rowHeight,periodY=rowsEnd+18,feeTitleY=periodY+82,feeBoxY=feeTitleY+34,bankTitleY=feeBoxY+174,bankBoxY=bankTitleY+34,footerY=bankBoxY+220,height=footerY+118,period=data.bounds.startDate?`Từ ${data.bounds.startTime} • ${dateVN(data.bounds.startDate)} đến ${data.bounds.endTime} • ${dateVN(data.bounds.endDate)}`:'Chưa xác định đủ mốc giờ và ngày',unitLabel=money(data.unit),totalLabel=money(data.amount),s=data.student,studentName=short(s.full||s.name,34),studentNameSize=studentName.length>29?13:studentName.length>24?14:studentName.length>18?15:25;
    const rowSvg=data.records.map((record,index)=>posterRowSvg(record,index,rowsY+index*rowHeight,theme)).join('');
    const receiptTitle=data.receipt?'PHIẾU THU HỌC PHÍ':'LỊCH HỌC & HỌC PHÍ';
    const feeHeading=data.receipt?`ĐÃ THU ${data.records.length} BUỔI`:`HỌC PHÍ LỚP ${data.records.length} BUỔI`;
    const totalCaption=data.receipt?'SỐ TIỀN ĐÃ THU':'TỔNG HỌC PHÍ';
    const receiptBlock=`<g><rect x="342" y="${bankTitleY}" width="396" height="48" rx="20" fill="${theme.dark}"/><text x="540" y="${bankTitleY+33}" class="head" font-size="23">XÁC NHẬN THANH TOÁN</text><rect x="60" y="${bankBoxY}" width="960" height="195" rx="24" fill="#fff" stroke="${theme.primary}" stroke-width="3"/><text x="95" y="${bankBoxY+48}" class="label">ĐÃ NHẬN ĐỦ HỌC PHÍ:</text><text x="420" y="${bankBoxY+48}" class="value" font-size="28">${xml(totalLabel)}</text><text x="95" y="${bankBoxY+91}" class="label" font-size="17">NGÀY THU:</text><text x="245" y="${bankBoxY+91}" class="value" font-size="23">${xml(dateVN(data.payment?.date))}</text><text x="570" y="${bankBoxY+91}" class="label" font-size="17">MÃ PHIẾU:</text><text x="735" y="${bankBoxY+91}" class="value" font-size="21">${xml(short(String(data.payment?.id||'').toUpperCase(),18))}</text><line x1="90" y1="${bankBoxY+112}" x2="990" y2="${bankBoxY+112}" stroke="${theme.line}" stroke-dasharray="7 6"/><text x="95" y="${bankBoxY+153}" class="label" font-size="17">GHI CHÚ:</text><text x="245" y="${bankBoxY+153}" class="small" font-size="20">${xml(short(data.payment?.note||'Đã nhận học phí.',58))}</text></g>`;
    const forecastBlock=`<g><rect x="342" y="${bankTitleY}" width="396" height="48" rx="20" fill="${theme.dark}"/><text x="540" y="${bankTitleY+33}" class="head" font-size="23">HƯỚNG DẪN NỘP HỌC PHÍ</text><rect x="60" y="${bankBoxY}" width="960" height="195" rx="24" fill="#fff" stroke="${theme.primary}" stroke-width="3"/><text x="95" y="${bankBoxY+40}" class="label">NỘI DUNG CHUYỂN KHOẢN:</text><text x="95" y="${bankBoxY+70}" class="value" font-size="13" fill="${theme.dark}">${xml(short(data.transferContent,76))}</text><line x1="90" y1="${bankBoxY+90}" x2="990" y2="${bankBoxY+90}" stroke="${theme.line}" stroke-dasharray="7 6"/><text x="95" y="${bankBoxY+122}" class="label" font-size="13">SỐ ĐIỆN THOẠI (Zalo)</text><text x="95" y="${bankBoxY+158}" class="value" font-size="19">${xml(data.settings.phone||'Chưa nhập')}</text><text x="420" y="${bankBoxY+122}" class="label" font-size="13">SỐ TÀI KHOẢN (STK)</text><text x="420" y="${bankBoxY+158}" class="value" font-size="19">${xml(data.settings.accountNumber||'Chưa nhập')}</text><text x="760" y="${bankBoxY+122}" class="label" font-size="13">NGÂN HÀNG</text><text x="760" y="${bankBoxY+158}" class="value" font-size="19">${xml(data.settings.bankName||'Chưa nhập')}</text></g>`;
    const settlementBlock=data.receipt?receiptBlock:forecastBlock;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-label="Phiếu lịch học và học phí của ${xml(s.full||s.name)}">
      <defs>
        <linearGradient id="posterBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.paper}"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="${theme.soft}"/></linearGradient>
        <linearGradient id="posterHead" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${theme.dark}"/><stop offset=".56" stop-color="${theme.primary}"/><stop offset="1" stop-color="${theme.accent}"/></linearGradient>
        <linearGradient id="posterFee" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="${theme.soft}"/></linearGradient>
        <pattern id="posterDots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="${theme.primary}" opacity=".08"/></pattern>
        <filter id="posterShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="${theme.dark}" flood-opacity=".16"/></filter>
        <style>.title{font-family:Arial,'Segoe UI',sans-serif;font-weight:900;text-anchor:middle;letter-spacing:1px}.label{font-family:Arial,'Segoe UI',sans-serif;font-size:20px;font-weight:800;fill:${theme.dark}}.value{font-family:Arial,'Segoe UI',sans-serif;font-size:31px;font-weight:900;fill:${theme.primary}}.head{font-family:Arial,'Segoe UI',sans-serif;font-size:22px;font-weight:900;fill:#fff;text-anchor:middle}.row{font-family:Arial,'Segoe UI',sans-serif;font-size:22px;font-weight:650;fill:#15243a;text-anchor:middle}.stt{font-weight:900;fill:${theme.primary}}.small{font-family:Arial,'Segoe UI',sans-serif;font-size:18px;fill:#44546a}.money{font-family:Arial,'Segoe UI',sans-serif;font-weight:900;text-anchor:middle}</style>
      </defs>
      <rect width="1080" height="${height}" fill="url(#posterBg)"/><rect width="1080" height="${height}" fill="url(#posterDots)"/>
      <circle cx="48" cy="80" r="130" fill="${theme.soft2}"/><circle cx="1035" cy="160" r="165" fill="${theme.soft2}" opacity=".8"/><path d="M0 250 C190 195 310 290 500 235 S840 190 1080 260 L1080 0 L0 0Z" fill="${theme.soft}" opacity=".72"/>
      <g opacity=".72"><circle cx="73" cy="178" r="8" fill="${theme.accent}"/><circle cx="986" cy="58" r="8" fill="${theme.primary}"/><path d="M130 50 l8 17 18 3-13 13 3 19-16-9-17 9 4-19-14-13 19-3Z" fill="${theme.accent}"/><path d="M937 225 l7 14 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" fill="${theme.primary}"/></g>
      <text x="540" y="82" class="title" font-size="57" fill="${theme.primary}" stroke="#fff" stroke-width="10" paint-order="stroke">${xml(receiptTitle)}</text>
      <text x="540" y="157" class="title" font-size="68" fill="${theme.dark}" stroke="#fff" stroke-width="11" paint-order="stroke">LỚP HỌC THẦY ĐỨC</text>
      <g><rect x="276" y="196" width="540" height="55" rx="27" fill="${theme.dark}" opacity=".14"/><rect x="270" y="190" width="540" height="55" rx="27" fill="url(#posterHead)"/><text x="540" y="226" class="title" font-size="25" fill="#fff">Học vui – Học tốt – Tiến bộ mỗi ngày!</text></g>
      <g><rect x="76" y="288" width="940" height="110" rx="24" fill="${theme.dark}" opacity=".12"/><rect x="70" y="280" width="940" height="110" rx="24" fill="#fff" stroke="${theme.primary}" stroke-width="3"/><line x1="570" y1="298" x2="570" y2="372" stroke="${theme.line}" stroke-width="2"/><line x1="710" y1="298" x2="710" y2="372" stroke="${theme.line}" stroke-width="2"/><circle cx="122" cy="335" r="34" fill="${theme.soft2}"/><text x="122" y="347" text-anchor="middle" font-size="37" fill="${theme.primary}">●</text><text x="360" y="317" class="label" font-size="17" text-anchor="middle">HỌC SINH</text><text x="360" y="357" class="value" font-size="${studentNameSize}" text-anchor="middle">${xml(studentName)}</text><text x="640" y="317" class="label" font-size="17" text-anchor="middle">LỚP</text><text x="640" y="357" class="value" text-anchor="middle">${xml(s.grade)}</text><text x="860" y="317" class="label" font-size="17" text-anchor="middle">MÔN HỌC</text><text x="860" y="357" class="value" font-size="25" text-anchor="middle">${xml(short(s.subjects,20))}</text></g>
      <rect x="50" y="425" width="980" height="${71+data.records.length*rowHeight}" rx="22" fill="#fff" stroke="${theme.primary}" stroke-width="3"/>
      <path d="M72 425 H1008 Q1030 425 1030 447 V496 H50 V447 Q50 425 72 425Z" fill="url(#posterHead)"/>
      <text x="95" y="469" class="head">STT</text><text x="215" y="469" class="head">NGÀY</text><text x="380" y="469" class="head">THỨ</text><text x="550" y="469" class="head">GIỜ HỌC</text><text x="780" y="469" class="head">MÔN HỌC</text><text x="980" y="469" class="head">CHECK</text>
      <g>${rowSvg}<line x1="140" y1="425" x2="140" y2="${rowsEnd}" stroke="${theme.line}"/><line x1="290" y1="425" x2="290" y2="${rowsEnd}" stroke="${theme.line}"/><line x1="470" y1="425" x2="470" y2="${rowsEnd}" stroke="${theme.line}"/><line x1="630" y1="425" x2="630" y2="${rowsEnd}" stroke="${theme.line}"/><line x1="930" y1="425" x2="930" y2="${rowsEnd}" stroke="${theme.line}"/></g>
      <g><rect x="80" y="${periodY}" width="920" height="60" rx="18" fill="${theme.soft}" stroke="${theme.line}"/><text x="105" y="${periodY+25}" class="label" font-size="15">GIAI ĐOẠN CHÍNH XÁC</text><text x="105" y="${periodY+49}" class="small" font-size="18">${xml(short(period,75))}${data.makeup?` • Có ${data.makeup} buổi học bù`:''}</text></g>
      <g><rect x="348" y="${feeTitleY}" width="384" height="48" rx="20" fill="url(#posterHead)"/><text x="540" y="${feeTitleY+33}" class="head" font-size="23">${xml(feeHeading)}</text><rect x="80" y="${feeBoxY}" width="920" height="145" rx="24" fill="url(#posterFee)" stroke="${theme.primary}" stroke-width="3"/><rect x="108" y="${feeBoxY+22}" width="215" height="103" rx="18" fill="#fff" stroke="${theme.line}"/><text x="216" y="${feeBoxY+75}" class="money" font-size="49" fill="${theme.primary}">${data.records.length}</text><text x="216" y="${feeBoxY+108}" class="title" font-size="19" fill="${theme.dark}">BUỔI HỌC</text><text x="352" y="${feeBoxY+86}" class="money" font-size="52" fill="${theme.dark}">×</text><rect x="390" y="${feeBoxY+22}" width="248" height="103" rx="18" fill="#fff" stroke="${theme.line}"/><text x="514" y="${feeBoxY+70}" class="money" font-size="37" fill="${theme.success}">${xml(unitLabel)}</text><text x="514" y="${feeBoxY+106}" class="title" font-size="18" fill="${theme.dark}">/ BUỔI</text><text x="666" y="${feeBoxY+86}" class="money" font-size="48" fill="${theme.dark}">=</text><rect x="704" y="${feeBoxY+22}" width="268" height="103" rx="18" fill="${theme.soft}" stroke="${theme.line}"/><text x="838" y="${feeBoxY+70}" class="money" font-size="39" fill="${theme.dark}">${xml(totalLabel)}</text><text x="838" y="${feeBoxY+106}" class="title" font-size="18" fill="${theme.dark}">${xml(totalCaption)}</text></g>
      ${settlementBlock}
      <g><rect x="205" y="${footerY}" width="670" height="78" rx="38" fill="${theme.soft}" stroke="${theme.primary}" stroke-width="2" stroke-dasharray="8 5"/><text x="540" y="${footerY+34}" class="title" font-size="25" fill="${theme.dark}">Cảm ơn Quý phụ huynh đã tin tưởng</text><text x="540" y="${footerY+62}" class="title" font-size="22" fill="${theme.primary}">và đồng hành cùng Thầy Đức!</text><circle cx="168" cy="${footerY+38}" r="20" fill="${theme.accent}" opacity=".85"/><circle cx="912" cy="${footerY+38}" r="20" fill="${theme.primary}" opacity=".85"/></g>
    </svg>`
  }
  function renderPreview(){
    const preview=document.getElementById('tuitionPosterPreview'),summary=document.getElementById('tuitionNoticeSummary'),data=noticeData();
    if(!preview||!data)return;
    if(!data.records.length){preview.innerHTML='<div class="empty">Hãy chọn ít nhất một buổi để tạo phiếu.</div>';if(summary)summary.textContent='Chưa chọn buổi học.';return}
    preview.innerHTML=tuitionPosterSvg(data);
    if(summary)summary.innerHTML=`Đã chọn <b>${data.records.length} buổi</b>${data.future?` • <b>${data.future} buổi chưa học đã có TKB</b>`:''}${data.makeup?` • <b>${data.makeup} buổi học bù</b>`:''} • Tổng phiếu <b>${money(data.amount)}</b>. Giai đoạn từ <b>${esc(data.bounds.startTime)} • ${dateVN(data.bounds.startDate)}</b> đến <b>${esc(data.bounds.endTime)} • ${dateVN(data.bounds.endDate)}</b>.`
  }
  function syncStudent(form){
    state.studentId=form.elements.student.value;state.paymentId='';form.dataset.paymentId='';
    const ids=noticeDefaultIds(state.studentId),picker=document.getElementById('tuitionNoticeSessions');
    picker.innerHTML=noticeSessionPicker(state.studentId,'',ids);renderPreview()
  }
  function openNotice(studentId='',paymentId=''){
    const payment=noticePayment(paymentId),selected=payment?.student||studentId||db.students.find(item=>item.status==='active')?.id||db.students[0]?.id;
    if(!selected){toast('Chưa có học sinh để tạo phiếu học phí.');return}
    state.studentId=selected;state.paymentId=paymentId;
    const settings={...tuitionNoticeDefaults,...(db.tuitionNoticeSettings||{}),theme:'green'},selectedIds=noticeDefaultIds(selected,paymentId),students=db.students.filter(item=>item.status==='active'||item.id===selected);
    openModal(payment?'Tạo phiếu từ khoản học phí đã lưu':'Tạo phiếu thu học phí theo buổi',`<form id="tuitionNoticeForm" data-payment-id="${esc(paymentId)}" onsubmit="return false"><div class="tuition-poster-layout"><div class="tuition-poster-controls"><div class="forecast-note"><b>Chọn tự do các buổi đã học hoặc chưa học đã có trong Thời khóa biểu.</b> Phiếu này chỉ dùng để thông báo/thu học phí; chưa tự ghi “đã thu”, không đối trừ công nợ. Buổi chưa học được ghi “LỊCH” để tránh nhầm là đã hoàn thành.</div><div class="tuition-poster-fields"><div class="field full"><label>Học sinh</label><select name="student" onchange="syncTuitionNoticeStudent(this.form)" ${payment?'disabled':''}>${students.map(item=>`<option value="${item.id}" ${item.id===selected?'selected':''}>${esc(item.full||item.name)} • Lớp ${esc(item.grade)}</option>`).join('')}</select></div><div class="field"><label>Màu phiếu</label><input value="Xanh lá pastel • Cố định" readonly><input type="hidden" name="theme" value="green"></div><div class="field"><label>Ngân hàng</label><input name="bankName" maxlength="100" value="${esc(settings.bankName)}" oninput="renderTuitionNoticePreview()"></div><div class="field"><label>Số điện thoại / Zalo</label><input name="phone" maxlength="50" value="${esc(settings.phone)}" oninput="renderTuitionNoticePreview()"></div><div class="field"><label>Số tài khoản</label><input name="accountNumber" maxlength="100" value="${esc(settings.accountNumber)}" oninput="renderTuitionNoticePreview()"></div><div class="field full"><label>Nội dung chuyển khoản</label><input name="transferTemplate" maxlength="300" value="${esc(settings.transferTemplate)}" oninput="renderTuitionNoticePreview()"><small class="sub">Dùng {Học sinh} và {số buổi}; hệ thống tự thay đúng nội dung.</small></div></div><div class="field"><label>Chọn các buổi đưa lên phiếu (kể cả buổi chưa học)</label><div class="payment-session-picker" id="tuitionNoticeSessions">${noticeSessionPicker(selected,paymentId,selectedIds)}</div><div class="payment-selection-summary" id="tuitionNoticeSummary"></div></div><div class="tuition-poster-note">Thông tin ngân hàng được ghi nhớ và đồng bộ cùng dữ liệu lớp. Phiếu luôn dùng <b>Xanh lá pastel</b> và chỉ xuất ảnh trên thiết bị của thầy, không tự gửi cho ai.</div><div class="tuition-poster-actions"><button type="button" class="btn primary" onclick="shareTuitionNotice()">↗ Chia sẻ ảnh</button><button type="button" class="btn outline" onclick="downloadTuitionNotice()">⇩ Tải PNG</button><button type="button" class="btn outline" onclick="printTuitionNotice()">⎙ In / Lưu PDF</button></div></div><div class="tuition-poster-preview" id="tuitionPosterPreview"></div></div></form>`,true);
    if(payment){const form=document.getElementById('tuitionNoticeForm'),forecast=form?.querySelector('.forecast-note'),note=form?.querySelector('.tuition-poster-note'),fields=['bankName','phone','accountNumber','transferTemplate'];if(forecast)forecast.innerHTML='<b>Đây là phiếu thu xác nhận khoản tiền đã nhận.</b> Học sinh, số tiền và danh sách buổi được khóa theo khoản thu đã lưu; việc xuất phiếu không làm thay đổi công nợ.';fields.forEach(name=>form?.elements[name]?.closest('.field')?.setAttribute('hidden',''));const picker=form?.querySelector('#tuitionNoticeSessions')?.closest('.field');if(picker)picker.querySelector('label').textContent='Các buổi đã thu (chỉ xem)';if(note)note.textContent='Phiếu thu chỉ được tạo từ khoản đã ghi nhận. Ảnh được xuất trên thiết bị của thầy và không tự gửi cho ai.';const buttons=form?.querySelectorAll('.tuition-poster-actions button');if(buttons?.[0])buttons[0].textContent='↗ Chia sẻ phiếu thu';if(buttons?.[1])buttons[1].textContent='⇩ Tải phiếu thu';if(buttons?.[2])buttons[2].textContent='⎙ In phiếu thu'}
    renderPreview()
  }
  function currentSvg(){const svg=document.querySelector('#tuitionPosterPreview svg');if(!svg){alert('Hãy chọn ít nhất một buổi trước khi xuất phiếu.');return''}return svg.outerHTML}
  function pngBlobFromSvg(svg){
    return new Promise((resolve,reject)=>{const source=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(source),image=new Image();image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=Number(image.naturalWidth)||1080;canvas.height=Number(image.naturalHeight)||1800;const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(blob):reject(new Error('Không tạo được ảnh PNG.'))},'image/png',1)}catch(error){URL.revokeObjectURL(url);reject(error)}};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Không đọc được bản xem trước.'))};image.src=url})
  }
  function noticeFilename(){const data=noticeData(),prefix=data?.receipt?'phieu-thu-hoc-phi':'phieu-hoc-phi';return`${prefix}-${fileSlug(data?.student?.full||data?.student?.name)}-${isoLocal(new Date())}.png`}
  function saveBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  async function downloadNotice(){const svg=currentSvg();if(!svg)return;const form=document.getElementById('tuitionNoticeForm');rememberNoticeSettings(form);try{const data=noticeData(),blob=await pngBlobFromSvg(svg);saveBlob(blob,noticeFilename());toast(data?.receipt?'Đã tải phiếu thu dạng ảnh PNG.':'Đã tải phiếu học phí dạng ảnh PNG.')}catch(error){alert(`Chưa tải được ảnh: ${error.message}`)}}
  async function shareNotice(){const svg=currentSvg();if(!svg)return;const form=document.getElementById('tuitionNoticeForm');rememberNoticeSettings(form);try{const data=noticeData(),blob=await pngBlobFromSvg(svg),file=new File([blob],noticeFilename(),{type:'image/png'}),title=`${data?.receipt?'Phiếu thu học phí':'Phiếu học phí'} ${data.student.name}`,text=data?.receipt?'Xác nhận khoản học phí đã thu – Lớp học Thầy Đức':'Lịch học và học phí – Lớp học Thầy Đức';if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title,text,files:[file]});toast('Đã mở bảng chia sẻ ảnh.')}else{saveBlob(blob,file.name);toast('Thiết bị chưa hỗ trợ chia sẻ trực tiếp; ảnh PNG đã được tải xuống.')}}catch(error){if(error?.name!=='AbortError')alert(`Chưa chia sẻ được ảnh: ${error.message}`)}}
  function printNotice(){const svg=currentSvg();if(!svg)return;const form=document.getElementById('tuitionNoticeForm');rememberNoticeSettings(form);const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),popup=window.open('','ducTuitionNoticePrint');if(!popup){URL.revokeObjectURL(url);alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.');return}popup.document.write(`<!doctype html><html><head><title>Phiếu học phí</title><style>@page{margin:0}body{margin:0;background:#fff;display:grid;place-items:center}img{display:block;width:min(100%,1080px);height:auto}@media print{img{width:100%}}</style></head><body><img src="${url}" onload="setTimeout(()=>window.print(),250)"></body></html>`);popup.document.close();setTimeout(()=>URL.revokeObjectURL(url),60000)}

  window.openTuitionNotice=openNotice;
  window.renderTuitionNoticePreview=renderPreview;
  window.syncTuitionNoticeStudent=syncStudent;
  window.downloadTuitionNotice=downloadNotice;
  window.shareTuitionNotice=shareNotice;
  window.printTuitionNotice=printNotice;
})();

(()=>{
  if(typeof window.renderStudents!=='function'||!document.getElementById('students'))return;

  let statusFilter='all';
  let sortMode='name-asc';
  let inactiveExpanded=localStorage.getItem('ducStudentInactiveExpanded')==='true';

  const style=document.createElement('style');
  style.id='student-list-enhancement-style';
  style.textContent=`
    .student-overview{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:-2px 0 18px;padding:13px 15px;border:1px solid #cfe6e1;border-radius:16px;background:linear-gradient(90deg,#f0fdfa,#f8fbff)}
    .student-summary{display:flex;align-items:center;gap:9px;color:#475569;font-size:12px;font-weight:700}.student-summary:before{content:'●';color:var(--teal);font-size:10px}.student-summary b{color:var(--navy2)}
    .student-list-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.student-filter-pills{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--line);border-radius:13px;background:#fff}.student-filter-btn{border:0;background:transparent;color:#64748b;border-radius:9px;padding:7px 10px;font-size:11px;font-weight:850;white-space:nowrap}.student-filter-btn:hover{background:#f1f5f9;color:var(--ink)}.student-filter-btn.active{background:#e7f7f3;color:var(--teal);box-shadow:inset 0 0 0 1px #b9e4da}.student-filter-btn[data-student-filter="inactive"].active{background:#fff1f2;color:#be123c;box-shadow:inset 0 0 0 1px #fecdd3}.student-filter-count{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:4px;padding:0 5px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px}.student-filter-btn.active .student-filter-count{background:#fff;color:inherit}
    .student-sort-control{display:flex;align-items:center;gap:7px;color:#64748b;font-size:11px;font-weight:800}.student-sort-control select{min-width:150px;border:1px solid var(--line);border-radius:11px;padding:8px 10px;background:#fff;color:var(--ink);font-weight:700;outline:none}.student-sort-control select:focus{border-color:#58b9a8;box-shadow:0 0 0 3px #dff6f0}
    #studentGrid.student-groups{display:grid;grid-template-columns:1fr;gap:18px}.student-group{padding:16px;border:1px solid #dcebe7;border-radius:20px;background:rgba(255,255,255,.62)}.student-group.inactive-group{border-color:#e5e7eb;background:rgba(248,250,252,.78)}.student-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.student-group.collapsed .student-group-head{margin-bottom:0}.student-group-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.student-group-title strong{color:var(--navy2);font-size:14px}.student-group-dot{width:9px;height:9px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 4px #dff6f0}.inactive-group .student-group-dot{background:#ef4444;box-shadow:0 0 0 4px #fee2e2}.student-group-count{padding:3px 7px;border-radius:999px;background:#eaf7f4;color:var(--teal);font-size:10px;font-weight:850}.inactive-group .student-group-count{background:#fff1f2;color:#be123c}.student-group-caption{margin-top:3px;color:#94a3b8;font-size:10px}.student-group-toggle{border:1px solid var(--line);background:#fff;color:#64748b;border-radius:10px;padding:7px 10px;font-size:10px;font-weight:850;white-space:nowrap}.student-group-toggle:hover{border-color:#cbd5e1;background:#f8fafc;color:var(--ink)}.student-group.collapsed>.student-grid{display:none}.student-group>.student-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .student-card.inactive{border-color:#e5e7eb;background:linear-gradient(145deg,#fff,#fbfcfd);box-shadow:0 10px 28px rgba(15,45,70,.055)}.student-card.inactive:hover{border-color:#d1d5db;box-shadow:0 13px 30px rgba(15,45,70,.075)}.student-card.inactive .student-meta{background:#fafafa}.student-card.inactive .student-footer>b{color:#64748b}.student-card.inactive:before{width:3px;background:#ef4444}
    @media(max-width:1180px){.student-group>.student-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:860px){.student-overview{align-items:stretch}.student-list-tools{width:100%;justify-content:space-between}.student-group>.student-grid{grid-template-columns:1fr}}
    @media(max-width:560px){.student-list-tools,.student-filter-pills,.student-sort-control,.student-sort-control select{width:100%}.student-filter-pills{display:grid;grid-template-columns:repeat(3,1fr)}.student-filter-btn{padding:8px 5px}.student-sort-control{justify-content:space-between}.student-sort-control select{flex:1;min-width:0}.student-group{padding:12px}.student-group-head{align-items:flex-start}.student-group-toggle{padding:6px 8px}.student-card .student-footer{align-items:flex-start;flex-direction:column}.student-card .student-footer .actions{width:100%}}
  `;
  document.head.appendChild(style);

  const page=document.getElementById('students');
  const pageHead=page.querySelector('.page-head');
  const host=document.getElementById('studentGrid');
  if(!pageHead||!host)return;
  host.classList.remove('student-grid');
  host.classList.add('student-groups');

  const overview=document.createElement('div');
  overview.className='student-overview';
  overview.innerHTML=`<div class="student-summary" id="studentSummaryText"></div><div class="student-list-tools"><div class="student-filter-pills" role="group" aria-label="Lọc học sinh theo trạng thái"><button type="button" class="student-filter-btn active" data-student-filter="all">Tất cả <span class="student-filter-count" data-student-count="all">0</span></button><button type="button" class="student-filter-btn" data-student-filter="active">Đang học <span class="student-filter-count" data-student-count="active">0</span></button><button type="button" class="student-filter-btn" data-student-filter="inactive">Đã nghỉ <span class="student-filter-count" data-student-count="inactive">0</span></button></div><label class="student-sort-control">Sắp xếp<select id="studentSortEnhanced"><option value="name-asc">Tên A → Z</option><option value="name-desc">Tên Z → A</option><option value="grade-asc">Lớp thấp → cao</option><option value="grade-desc">Lớp cao → thấp</option></select></label></div>`;
  pageHead.insertAdjacentElement('afterend',overview);

  overview.addEventListener('click',event=>{
    const button=event.target.closest('[data-student-filter]');
    if(!button)return;
    statusFilter=button.dataset.studentFilter||'all';
    if(statusFilter==='inactive')inactiveExpanded=true;
    renderStudentsEnhanced();
  });
  overview.querySelector('#studentSortEnhanced').addEventListener('change',event=>{sortMode=event.target.value||'name-asc';renderStudentsEnhanced()});
  host.addEventListener('click',event=>{
    const button=event.target.closest('[data-student-toggle-inactive]');
    if(!button)return;
    event.stopPropagation();
    inactiveExpanded=!inactiveExpanded;
    localStorage.setItem('ducStudentInactiveExpanded',String(inactiveExpanded));
    renderStudentsEnhanced();
  });

  const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLocaleLowerCase('vi').trim();
  const displayName=item=>studentExtendedProfile(item.id).fullName||item.full||item.name||'';
  const shortName=item=>item.name||displayName(item);
  const gradeNumber=item=>{const profile=studentExtendedProfile(item.id),match=String(profile.gradeText||item.grade||'').match(/\d+/);return match?Number(match[0]):999};
  const compareName=(left,right)=>String(shortName(left)).localeCompare(String(shortName(right)),'vi',{sensitivity:'base'})||String(displayName(left)).localeCompare(String(displayName(right)),'vi',{sensitivity:'base'});
  const compareStudents=(left,right)=>{
    if(sortMode==='name-desc')return-compareName(left,right);
    if(sortMode==='grade-asc')return gradeNumber(left)-gradeNumber(right)||compareName(left,right);
    if(sortMode==='grade-desc')return gradeNumber(right)-gradeNumber(left)||compareName(left,right);
    return compareName(left,right);
  };

  function studentCardHtml(item,feeMap){
    const profile=studentExtendedProfile(item.id),active=item.status!=='inactive',initials=String(item.name||profile.fullName).split(' ').filter(Boolean).map(part=>part[0]).slice(-2).join(''),avatar=profile.avatarUrl?`<div class="student-avatar has-photo"><img src="${esc(profile.avatarUrl)}" alt="Ảnh ${esc(item.name)}"></div>`:`<div class="student-avatar">${esc(initials)}</div>`,sessions=feeMap.get(item.id)?.sessions||0;
    return `<article class="student-card ${active?'':'inactive'}" role="button" tabindex="0" onclick="openStudentDetail('${item.id}')" onkeydown="if(event.key==='Enter')openStudentDetail('${item.id}')"><div class="student-top">${avatar}<div><h3>${esc(profile.fullName)}</h3><span class="badge ${active?'green':'red'}"><i class="dot"></i>${active?'Đang học':'Đã nghỉ'}</span></div></div><div class="student-meta"><div><small>Lớp</small><b>${esc(profile.gradeText||item.grade)}</b></div><div><small>Trường</small><b>${esc(profile.school||'Chưa điền')}</b></div><div><small>Môn học</small><b>${esc(item.subjects)}</b></div><div><small>Đơn giá</small><b>${money(item.fee)}/buổi</b></div></div><div class="student-footer"><b>${sessions} buổi tính phí</b><div class="actions"><button class="btn soft small" onclick="event.stopPropagation();openStudentDetail('${item.id}')">Hồ sơ & lịch học</button><button class="btn outline small" onclick="event.stopPropagation();editStudent('${item.id}')">Sửa</button><button class="btn danger small" onclick="event.stopPropagation();deleteStudent('${item.id}')">Xóa</button></div></div></article>`;
  }

  function groupHtml(kind,items,feeMap,forceExpanded=false){
    if(!items.length)return'';
    const inactive=kind==='inactive',collapsed=inactive&&!forceExpanded&&!inactiveExpanded,label=inactive?'Đã nghỉ':'Đang học',caption=inactive?'Hồ sơ học sinh cũ được tách riêng để danh sách chính gọn hơn.':'Học sinh hiện đang theo học và cần ưu tiên quản lý hằng ngày.',toggle=inactive?`<button type="button" class="student-group-toggle" data-student-toggle-inactive aria-expanded="${collapsed?'false':'true'}">${collapsed?'Hiện danh sách ↓':'Thu gọn ↑'}</button>`:'';
    return `<section class="student-group ${inactive?'inactive-group':''} ${collapsed?'collapsed':''}"><div class="student-group-head"><div><div class="student-group-title"><span class="student-group-dot"></span><strong>${label}</strong><span class="student-group-count">${items.length} học sinh</span></div><div class="student-group-caption">${caption}</div></div>${toggle}</div><div class="student-grid">${items.map(item=>studentCardHtml(item,feeMap)).join('')}</div></section>`;
  }

  function renderStudentsEnhanced(){
    const query=normalizeSearch(document.getElementById('studentSearch')?.value),all=[...(db.students||[])],activeTotal=all.filter(item=>item.status!=='inactive').length,inactiveTotal=all.length-activeTotal,feeMap=new Map(feeRows().map(row=>[row.id,row]));
    overview.querySelectorAll('[data-student-count]').forEach(node=>{const key=node.dataset.studentCount;node.textContent=key==='active'?activeTotal:key==='inactive'?inactiveTotal:all.length});
    overview.querySelectorAll('[data-student-filter]').forEach(button=>{const selected=button.dataset.studentFilter===statusFilter;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    const matching=all.filter(item=>{const profile=studentExtendedProfile(item.id),haystack=normalizeSearch([item.full,item.name,item.subjects,profile.fullName,profile.school,profile.gradeText].join(' '));return!query||haystack.includes(query)}),visible=matching.filter(item=>statusFilter==='all'||(statusFilter==='active'?item.status!=='inactive':item.status==='inactive')),active=visible.filter(item=>item.status!=='inactive').sort(compareStudents),inactive=visible.filter(item=>item.status==='inactive').sort(compareStudents),summary=document.getElementById('studentSummaryText');
    if(summary){const narrowed=query||statusFilter!=='all';summary.innerHTML=narrowed?`Đang hiển thị <b>${visible.length}/${all.length}</b> học sinh • ${active.length} đang học • ${inactive.length} đã nghỉ`:`<b>${activeTotal}</b> đang học • <b>${inactiveTotal}</b> đã nghỉ • <b>${all.length}</b> tổng cộng`}
    if(!visible.length){host.innerHTML='<div class="empty">Không tìm thấy học sinh phù hợp.</div>';fillStudentSelects();return}
    if(statusFilter==='active')host.innerHTML=groupHtml('active',active,feeMap,true);
    else if(statusFilter==='inactive')host.innerHTML=groupHtml('inactive',inactive,feeMap,true);
    else host.innerHTML=groupHtml('active',active,feeMap,true)+groupHtml('inactive',inactive,feeMap,Boolean(query));
    fillStudentSelects();
  }

  window.renderStudents=renderStudentsEnhanced;
  renderStudentsEnhanced();
})();