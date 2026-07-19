import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TEACHER_EMAIL = (Deno.env.get('TEACHER_EMAIL') || 'lehuuducdhsp@gmail.com').toLowerCase()
const STUDENT_DOMAIN = 'student.lophocthayduc.invalid'
const STUDENT_BUCKET = 'student-work'
const BRANDING_BUCKET = 'classroom-documents'
const DOCUMENT_BUCKET = BRANDING_BUCKET
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const SUBMISSION_MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_ORIGINS = new Set([
  'https://lehuuducdhsp-png.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
])
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SUBMISSION_TYPES = new Set([
  ...AVATAR_TYPES,
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
])

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function cors(req: Request) {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://lehuuducdhsp-png.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function cleanUsername(input: unknown) {
  return String(input || '').trim().toLowerCase()
}

function validUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{3,31}$/.test(username)
}

function authEmail(username: string) {
  return `${username}@${STUDENT_DOMAIN}`
}

function safeText(input: unknown, max = 120) {
  return String(input || '').trim().slice(0, max)
}

function safeDate(input: unknown) {
  const value = safeText(input, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function safeFileName(input: unknown) {
  const value = safeText(input, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return value || 'tep-dinh-kem'
}

function validatePassword(input: unknown) {
  const password = String(input || '')
  if (password.length < 12 || password.length > 128) throw new Error('Mật khẩu cần từ 12 đến 128 ký tự.')
  if (!/[A-Za-zÀ-ỹ]/u.test(password) || !/\d/.test(password)) throw new Error('Mật khẩu cần có chữ và số.')
  return password
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

async function classroom(ownerId: string) {
  const { data, error } = await admin.from('classroom_state').select('data').eq('owner_id', ownerId).maybeSingle()
  if (error) throw error
  return data?.data || {}
}

async function audit(ownerId: string, studentId: string, action: string, actorId: string, detail: Record<string, unknown> = {}) {
  await admin.from('student_account_audit').insert({ owner_id: ownerId, student_id: studentId, action, actor_id: actorId, detail })
}

function publicAccount(row: Record<string, unknown>) {
  return {
    studentId: row.student_id,
    authUserId: row.auth_user_id,
    username: row.username,
    displayName: row.display_name,
    status: row.status,
    mustChangePassword: row.must_change_password,
    passwordChangedAt: row.password_changed_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function publicProfile(row: any, fallback: any = {}) {
  return {
    fullName: row?.full_name || fallback.full || fallback.name || '',
    school: row?.school || fallback.school || '',
    gradeText: row?.grade_text || String(fallback.grade || ''),
    dateOfBirth: row?.date_of_birth || fallback.dateOfBirth || '',
    studentPhone: row?.student_phone || fallback.studentPhone || '',
    parentName: row?.parent_name || fallback.parentName || '',
    parentPhone: row?.parent_phone || fallback.parentPhone || '',
    address: row?.address || fallback.address || '',
    note: row?.note || fallback.profileNote || '',
    avatarPath: row?.avatar_path || '',
    updatedAt: row?.updated_at || '',
  }
}

async function signedUrl(bucket: string, path: unknown, expires = 3600) {
  const value = safeText(path, 1000)
  if (!value) return ''
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(value, expires)
  if (error) return ''
  return data?.signedUrl || ''
}

async function objectExists(path: string) {
  const slash = path.lastIndexOf('/')
  if (slash < 1) return false
  const folder = path.slice(0, slash)
  const name = path.slice(slash + 1)
  const { data, error } = await admin.storage.from(STUDENT_BUCKET).list(folder, { limit: 20, search: name })
  return !error && Boolean(data?.some(item => item.name === name))
}

function baseStudentDashboard(state: any, studentId: string) {
  const profile = Array.isArray(state.students) ? state.students.find((item: any) => item?.id === studentId) : null
  if (!profile) return null
  const fields = (item: any, allowed: string[]) => Object.fromEntries(allowed.filter(key => item?.[key] !== undefined).map(key => [key, item[key]]))
  return {
    profile: fields(profile, ['id', 'name', 'full', 'grade', 'subjects', 'mode', 'status', 'school', 'dateOfBirth', 'studentPhone', 'parentName', 'parentPhone', 'address']),
    schedules: (Array.isArray(state.schedules) ? state.schedules : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'date', 'weekStart', 'day', 'time', 'subject', 'mode'])),
    attendance: (Array.isArray(state.attendance) ? state.attendance : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'scheduleId', 'date', 'time', 'subject', 'status', 'lessonTopic', 'comprehension', 'attitude', 'lessonCompletion', 'reviewNote', 'reviewedAt'])),
    scores: (Array.isArray(state.scores) ? state.scores : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'date', 'type', 'subject', 'score', 'weight'])),
    assignments: (Array.isArray(state.assignments) ? state.assignments : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'sessionId', 'assignedDate', 'subject', 'due', 'dueScheduleId', 'title', 'status', 'note'])),
    documents: (Array.isArray(state.documents) ? state.documents : []).filter((item: any) => documentVisibleToStudent(item, studentId, profile.status)).map((item: any) => fields(item, ['id', 'title', 'type', 'size', 'bytes', 'createdAt'])),
    generatedAt: new Date().toISOString(),
  }
}

function documentVisibleToStudent(doc: any, studentId: string, studentStatus: string) {
  if (!doc || doc.trashedAt || doc.pendingDelete || !doc.path) return false
  if (doc.audienceMode === 'all') return studentStatus === 'active'
  return doc.audienceMode === 'selected' && Array.isArray(doc.studentIds) && doc.studentIds.includes(studentId)
}

async function studentDashboard(state: any, studentId: string, ownerId: string) {
  const dashboard: any = baseStudentDashboard(state, studentId)
  if (!dashboard) return null
  dashboard.branding = {
    brandName: safeText(state.settings?.brandName || 'LỚP HỌC THẦY ĐỨC', 120),
    teacherName: safeText(state.settings?.teacherName || 'LÊ HỮU ĐỨC', 120),
    teacherTitle: safeText(state.settings?.teacherTitle || 'Giáo viên KHTN & Hóa học', 160),
    slogan: safeText(state.settings?.slogan || 'Học chắc • Hiểu bản chất • Tiến bộ rõ ràng', 240),
    logoUrl: await signedUrl(BRANDING_BUCKET, state.settings?.logoPath),
    teacherAvatarUrl: await signedUrl(BRANDING_BUCKET, state.settings?.teacherAvatarPath),
  }
  try {
    const [{ data: profile, error: profileError }, { data: submissions, error: submissionsError }] = await Promise.all([
      admin.from('student_profiles').select('*').eq('owner_id', ownerId).eq('student_id', studentId).maybeSingle(),
      admin.from('assignment_submissions').select('*').eq('owner_id', ownerId).eq('student_id', studentId),
    ])
    if (profileError) throw profileError
    if (submissionsError) throw submissionsError
    const extended = publicProfile(profile, dashboard.profile)
    extended.avatarUrl = await signedUrl(STUDENT_BUCKET, extended.avatarPath)
    dashboard.profile = { ...dashboard.profile, ...extended }
    const byAssignment = new Map((submissions || []).map((item: any) => [item.assignment_id, item]))
    dashboard.assignments = await Promise.all(dashboard.assignments.map(async (assignment: any) => {
      const row: any = byAssignment.get(assignment.id)
      if (!row) return assignment
      const files = await Promise.all((Array.isArray(row.files) ? row.files : []).map(async (file: any) => ({
        name: safeText(file?.name, 240),
        type: safeText(file?.type, 120),
        size: Number(file?.size) || 0,
        path: safeText(file?.path, 1000),
        url: await signedUrl(STUDENT_BUCKET, file?.path, 900),
      })))
      return { ...assignment, submission: { content: row.content || '', files, submittedAt: row.submitted_at, updatedAt: row.updated_at } }
    }))
    dashboard.studentFeaturesReady = true
  } catch (error) {
    console.error('Student features are not ready:', error)
    dashboard.profile = { ...dashboard.profile, ...publicProfile(null, dashboard.profile), avatarUrl: '' }
    dashboard.studentFeaturesReady = false
  }
  return dashboard
}

async function teacherAction(req: Request, user: any, body: Record<string, unknown>) {
  if ((user.email || '').toLowerCase() !== TEACHER_EMAIL) return response(req, { error: 'Không có quyền quản lý tài khoản học sinh.' }, 403)
  const action = String(body.action || '')
  const ownerId = user.id

  if (action === 'list_accounts') {
    const { data, error } = await admin.from('student_accounts').select('*').eq('owner_id', ownerId).order('display_name')
    if (error) throw error
    return response(req, { accounts: (data || []).map(publicAccount) })
  }

  const studentId = safeText(body.studentId, 100)
  if (!studentId) return response(req, { error: 'Thiếu học sinh.' }, 400)

  if (action === 'preview_student') {
    const state = await classroom(ownerId)
    const dashboard = await studentDashboard(state, studentId, ownerId)
    if (!dashboard) return response(req, { error: 'Không tìm thấy hồ sơ học sinh.' }, 404)
    const { data: account, error: accountError } = await admin.from('student_accounts').select('username, status').eq('owner_id', ownerId).eq('student_id', studentId).maybeSingle()
    if (accountError) throw accountError
    await audit(ownerId, studentId, 'teacher_preview_student', user.id)
    return response(req, { preview: true, dashboard, account: account ? { username: account.username, status: account.status } : null })
  }

  if (action === 'create_account') {
    const username = cleanUsername(body.username)
    const password = validatePassword(body.password)
    if (!validUsername(username)) return response(req, { error: 'Tên đăng nhập cần 4–32 ký tự: chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.' }, 400)
    const state = await classroom(ownerId)
    const profile = Array.isArray(state.students) ? state.students.find((item: any) => item?.id === studentId) : null
    if (!profile) return response(req, { error: 'Không tìm thấy học sinh trong dữ liệu lớp học.' }, 404)
    if (profile.status !== 'active') return response(req, { error: 'Chỉ tạo tài khoản cho học sinh đang học.' }, 400)
    const { data: existing } = await admin.from('student_accounts').select('student_id').eq('student_id', studentId).maybeSingle()
    if (existing) return response(req, { error: 'Học sinh này đã có tài khoản.' }, 409)

    const displayName = safeText(profile.full || profile.name, 120)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
      app_metadata: { role: 'student', student_id: studentId, owner_id: ownerId },
    })
    if (createError || !created.user) throw createError || new Error('Không tạo được tài khoản Auth.')
    const { data: account, error: insertError } = await admin.from('student_accounts').insert({
      student_id: studentId,
      owner_id: ownerId,
      auth_user_id: created.user.id,
      username,
      display_name: displayName,
      status: 'active',
      must_change_password: true,
    }).select('*').single()
    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id)
      throw insertError
    }
    await admin.from('student_profiles').upsert({
      student_id: studentId,
      owner_id: ownerId,
      auth_user_id: created.user.id,
      full_name: displayName,
      school: safeText(profile.school, 200),
      grade_text: safeText(profile.grade, 40),
      date_of_birth: safeDate(profile.dateOfBirth),
      student_phone: safeText(profile.studentPhone, 30),
      parent_name: safeText(profile.parentName, 160),
      parent_phone: safeText(profile.parentPhone, 30),
      address: safeText(profile.address, 500),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id' })
    await audit(ownerId, studentId, 'create_account', user.id, { username })
    return response(req, { account: publicAccount(account) })
  }

  const { data: account, error: accountError } = await admin.from('student_accounts').select('*').eq('owner_id', ownerId).eq('student_id', studentId).maybeSingle()
  if (accountError) throw accountError
  if (!account) return response(req, { error: 'Học sinh này chưa có tài khoản.' }, 404)

  if (action === 'reset_password') {
    const password = validatePassword(body.password)
    const { error } = await admin.auth.admin.updateUserById(account.auth_user_id, { password })
    if (error) throw error
    await admin.from('student_accounts').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('student_id', studentId).eq('owner_id', ownerId)
    await audit(ownerId, studentId, 'reset_password', user.id)
    return response(req, { ok: true })
  }

  if (action === 'rename_account') {
    const username = cleanUsername(body.username)
    if (!validUsername(username)) return response(req, { error: 'Tên đăng nhập cần 4–32 ký tự hợp lệ.' }, 400)
    const { data: duplicate } = await admin.from('student_accounts').select('student_id').eq('username', username).neq('student_id', studentId).maybeSingle()
    if (duplicate) return response(req, { error: 'Tên đăng nhập này đã được sử dụng.' }, 409)
    const { error: authError } = await admin.auth.admin.updateUserById(account.auth_user_id, {
      email: authEmail(username),
      email_confirm: true,
      user_metadata: { username, display_name: account.display_name },
    })
    if (authError) throw authError
    const { data: updated, error } = await admin.from('student_accounts').update({ username, updated_at: new Date().toISOString() }).eq('student_id', studentId).eq('owner_id', ownerId).select('*').single()
    if (error) throw error
    await audit(ownerId, studentId, 'rename_account', user.id, { from: account.username, to: username })
    return response(req, { account: publicAccount(updated) })
  }

  if (action === 'set_account_status') {
    const status = body.status === 'locked' ? 'locked' : 'active'
    const { error: authError } = await admin.auth.admin.updateUserById(account.auth_user_id, { ban_duration: status === 'locked' ? '876000h' : 'none' })
    if (authError) throw authError
    const { data: updated, error } = await admin.from('student_accounts').update({ status, updated_at: new Date().toISOString() }).eq('student_id', studentId).eq('owner_id', ownerId).select('*').single()
    if (error) throw error
    await audit(ownerId, studentId, status === 'locked' ? 'lock_account' : 'unlock_account', user.id)
    return response(req, { account: publicAccount(updated) })
  }

  return response(req, { error: 'Thao tác không hợp lệ.' }, 400)
}

async function studentAction(req: Request, user: any, body: Record<string, unknown>) {
  const studentId = user.app_metadata?.student_id
  const ownerId = user.app_metadata?.owner_id
  if (user.app_metadata?.role !== 'student' || !studentId || !ownerId) return response(req, { error: 'Tài khoản không thuộc cổng học sinh.' }, 403)
  const { data: account, error } = await admin.from('student_accounts').select('*').eq('auth_user_id', user.id).eq('student_id', studentId).eq('owner_id', ownerId).maybeSingle()
  if (error) throw error
  if (!account || account.status !== 'active') return response(req, { error: 'Tài khoản đang bị khóa. Hãy liên hệ thầy Đức.' }, 403)

  const action = String(body.action || '')
  if (action === 'confirm_password_change') {
    await admin.from('student_accounts').update({ must_change_password: false, password_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('auth_user_id', user.id)
    await audit(ownerId, studentId, 'student_changed_password', user.id)
    return response(req, { ok: true })
  }
  if (action === 'student_dashboard' && account.must_change_password) return response(req, { mustChangePassword: true, profile: { displayName: account.display_name, username: account.username } })
  if (account.must_change_password) return response(req, { error: 'Em cần đổi mật khẩu tạm trước khi cập nhật hồ sơ hoặc nộp bài.' }, 403)

  const state = await classroom(ownerId)
  const coreProfile = Array.isArray(state.students) ? state.students.find((item: any) => item?.id === studentId) : null
  if (!coreProfile) return response(req, { error: 'Không tìm thấy hồ sơ học sinh.' }, 404)
  const assignments = Array.isArray(state.assignments) ? state.assignments.filter((item: any) => item?.student === studentId) : []

  if (action === 'open_document') {
    const documentId = safeText(body.documentId, 160)
    if (!documentId) return response(req, { error: 'Thiếu tài liệu.' }, 400)
    const doc = (Array.isArray(state.documents) ? state.documents : []).find((item: any) => item?.id === documentId)
    if (!documentVisibleToStudent(doc, studentId, coreProfile.status)) return response(req, { error: 'Tài liệu không tồn tại hoặc chưa được cấp cho em.' }, 404)
    const { data: signed, error: signedError } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.path, 120)
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Không tạo được liên kết tài liệu.')
    await audit(ownerId, studentId, 'student_open_document', user.id, { documentId })
    return response(req, { signedUrl: signed.signedUrl, expiresIn: 120 })
  }

  if (action === 'student_dashboard') {
    const dashboard = await studentDashboard(state, studentId, ownerId)
    await admin.from('student_accounts').update({ last_login_at: new Date().toISOString() }).eq('auth_user_id', user.id)
    return response(req, { mustChangePassword: false, dashboard })
  }

  if (action === 'save_profile') {
    const row = {
      student_id: studentId,
      owner_id: ownerId,
      auth_user_id: user.id,
      full_name: safeText(body.fullName, 160) || safeText(coreProfile.full || coreProfile.name, 160),
      school: safeText(body.school, 200),
      grade_text: safeText(body.gradeText, 40),
      date_of_birth: safeDate(body.dateOfBirth),
      student_phone: safeText(body.studentPhone, 30),
      parent_name: safeText(body.parentName, 160),
      parent_phone: safeText(body.parentPhone, 30),
      address: safeText(body.address, 500),
      note: safeText(body.note, 1000),
      updated_at: new Date().toISOString(),
    }
    const { data: saved, error: saveError } = await admin.from('student_profiles').upsert(row, { onConflict: 'student_id' }).select('*').single()
    if (saveError) throw new Error('Chưa bật lưu hồ sơ học sinh. Hãy chạy student_features.sql trong Supabase.')
    await audit(ownerId, studentId, 'student_updated_profile', user.id)
    return response(req, { profile: publicProfile(saved, coreProfile) })
  }

  if (action === 'create_student_upload') {
    const kind = body.kind === 'avatar' ? 'avatar' : 'assignment'
    const name = safeFileName(body.name)
    const type = safeText(body.type, 120).toLowerCase()
    const size = Number(body.size) || 0
    const assignmentId = safeText(body.assignmentId, 120)
    if (kind === 'avatar' && (!AVATAR_TYPES.has(type) || size < 1 || size > AVATAR_MAX_BYTES)) return response(req, { error: 'Ảnh đại diện phải là JPG, PNG hoặc WEBP và không quá 5 MB.' }, 400)
    if (kind === 'assignment' && (!SUBMISSION_TYPES.has(type) || size < 1 || size > SUBMISSION_MAX_BYTES)) return response(req, { error: 'Tệp bài làm không đúng định dạng hỗ trợ hoặc vượt quá 15 MB.' }, 400)
    if (kind === 'assignment' && !assignments.some((item: any) => item.id === assignmentId)) return response(req, { error: 'Bài tập không thuộc tài khoản này.' }, 403)
    const folder = kind === 'avatar' ? 'avatar' : `assignments/${assignmentId}`
    const path = `${ownerId}/${studentId}/${folder}/${Date.now()}-${crypto.randomUUID()}-${name}`
    const { data: upload, error: uploadError } = await admin.storage.from(STUDENT_BUCKET).createSignedUploadUrl(path)
    if (uploadError || !upload?.token) throw new Error('Chưa bật kho bài nộp học sinh. Hãy chạy student_features.sql trong Supabase.')
    return response(req, { bucket: STUDENT_BUCKET, path, token: upload.token })
  }

  if (action === 'complete_avatar_upload') {
    const path = safeText(body.path, 1000)
    const prefix = `${ownerId}/${studentId}/avatar/`
    if (!path.startsWith(prefix) || !await objectExists(path)) return response(req, { error: 'Không xác nhận được ảnh vừa tải lên.' }, 400)
    const { data: previous } = await admin.from('student_profiles').select('avatar_path').eq('student_id', studentId).maybeSingle()
    const { error: saveError } = await admin.from('student_profiles').upsert({
      student_id: studentId,
      owner_id: ownerId,
      auth_user_id: user.id,
      full_name: safeText(coreProfile.full || coreProfile.name, 160),
      grade_text: safeText(coreProfile.grade, 40),
      avatar_path: path,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id' })
    if (saveError) throw new Error('Chưa bật lưu ảnh đại diện học sinh. Hãy chạy student_features.sql trong Supabase.')
    if (previous?.avatar_path && previous.avatar_path !== path && String(previous.avatar_path).startsWith(prefix)) await admin.storage.from(STUDENT_BUCKET).remove([previous.avatar_path])
    await audit(ownerId, studentId, 'student_updated_avatar', user.id)
    return response(req, { avatarPath: path, avatarUrl: await signedUrl(STUDENT_BUCKET, path) })
  }

  if (action === 'save_assignment_submission') {
    const assignmentId = safeText(body.assignmentId, 120)
    if (!assignments.some((item: any) => item.id === assignmentId)) return response(req, { error: 'Bài tập không thuộc tài khoản này.' }, 403)
    const content = safeText(body.content, 10000)
    const inputFiles = Array.isArray(body.files) ? body.files.slice(0, 5) : []
    const prefix = `${ownerId}/${studentId}/assignments/${assignmentId}/`
    const files = []
    for (const item of inputFiles) {
      const path = safeText(item?.path, 1000)
      const type = safeText(item?.type, 120).toLowerCase()
      const size = Number(item?.size) || 0
      if (!path.startsWith(prefix) || !SUBMISSION_TYPES.has(type) || size < 1 || size > SUBMISSION_MAX_BYTES || !await objectExists(path)) return response(req, { error: 'Có tệp bài làm không hợp lệ hoặc chưa tải xong.' }, 400)
      files.push({ path, name: safeText(item?.name, 240), type, size })
    }
    if (!content && !files.length) return response(req, { error: 'Em cần nhập nội dung hoặc đính kèm ít nhất một tệp bài làm.' }, 400)
    const now = new Date().toISOString()
    const { error: saveError } = await admin.from('assignment_submissions').upsert({
      assignment_id: assignmentId,
      owner_id: ownerId,
      student_id: studentId,
      auth_user_id: user.id,
      content,
      files,
      submitted_at: now,
      updated_at: now,
    }, { onConflict: 'assignment_id' })
    if (saveError) throw new Error('Chưa bật lưu bài nộp học sinh. Hãy chạy student_features.sql trong Supabase.')
    await audit(ownerId, studentId, 'student_submitted_assignment', user.id, { assignmentId, fileCount: files.length })
    return response(req, { ok: true, submittedAt: now })
  }

  return response(req, { error: 'Thao tác không hợp lệ.' }, 400)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return response(req, { error: 'Chỉ hỗ trợ POST.' }, 405)
  try {
    const user = await authenticatedUser(req)
    if (!user) return response(req, { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }, 401)
    const body = await req.json().catch(() => ({}))
    if ((user.email || '').toLowerCase() === TEACHER_EMAIL) return await teacherAction(req, user, body)
    return await studentAction(req, user, body)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Lỗi máy chủ.'
    return response(req, { error: message }, 500)
  }
})
