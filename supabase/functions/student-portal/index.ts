import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TEACHER_EMAIL = (Deno.env.get('TEACHER_EMAIL') || 'lehuuducdhsp@gmail.com').toLowerCase()
const STUDENT_DOMAIN = 'student.lophocthayduc.invalid'
const ALLOWED_ORIGINS = new Set([
  'https://lehuuducdhsp-png.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
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

function studentDashboard(state: any, studentId: string) {
  const profile = Array.isArray(state.students) ? state.students.find((item: any) => item?.id === studentId) : null
  if (!profile) return null
  const fields = (item: any, allowed: string[]) => Object.fromEntries(allowed.filter(key => item?.[key] !== undefined).map(key => [key, item[key]]))
  return {
    profile: fields(profile, ['id', 'name', 'full', 'grade', 'subjects', 'mode', 'status']),
    schedules: (Array.isArray(state.schedules) ? state.schedules : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'date', 'weekStart', 'day', 'time', 'subject', 'mode'])),
    attendance: (Array.isArray(state.attendance) ? state.attendance : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'scheduleId', 'date', 'time', 'subject', 'status', 'lessonTopic', 'comprehension', 'attitude', 'lessonCompletion', 'reviewNote', 'reviewedAt'])),
    scores: (Array.isArray(state.scores) ? state.scores : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'date', 'type', 'subject', 'score', 'weight'])),
    assignments: (Array.isArray(state.assignments) ? state.assignments : []).filter((item: any) => item?.student === studentId).map((item: any) => fields(item, ['id', 'sessionId', 'assignedDate', 'subject', 'due', 'title', 'status', 'note'])),
    generatedAt: new Date().toISOString(),
  }
}

async function studentAction(req: Request, user: any, body: Record<string, unknown>) {
  const studentId = user.app_metadata?.student_id
  const ownerId = user.app_metadata?.owner_id
  if (user.app_metadata?.role !== 'student' || !studentId || !ownerId) return response(req, { error: 'Tài khoản không thuộc cổng học sinh.' }, 403)
  const { data: account, error } = await admin.from('student_accounts').select('*').eq('auth_user_id', user.id).eq('student_id', studentId).eq('owner_id', ownerId).maybeSingle()
  if (error) throw error
  if (!account || account.status !== 'active') return response(req, { error: 'Tài khoản đang bị khóa. Hãy liên hệ thầy Đức.' }, 403)

  if (body.action === 'confirm_password_change') {
    await admin.from('student_accounts').update({ must_change_password: false, password_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('auth_user_id', user.id)
    await audit(ownerId, studentId, 'student_changed_password', user.id)
    return response(req, { ok: true })
  }

  if (body.action !== 'student_dashboard') return response(req, { error: 'Thao tác không hợp lệ.' }, 400)
  if (account.must_change_password) return response(req, { mustChangePassword: true, profile: { displayName: account.display_name, username: account.username } })
  const state = await classroom(ownerId)
  const dashboard = studentDashboard(state, studentId)
  if (!dashboard) return response(req, { error: 'Không tìm thấy hồ sơ học sinh.' }, 404)
  await admin.from('student_accounts').update({ last_login_at: new Date().toISOString() }).eq('auth_user_id', user.id)
  return response(req, { mustChangePassword: false, dashboard })
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
