/**
 * Verification Script: Admin Approval Flow & Security Checks
 *
 * Tests the complete lifecycle:
 * 1. New user registers -> PENDING status -> login blocked (403)
 * 2. Admin logs in -> queries pending list -> user appears
 * 3. Admin approves user -> approvalStatus: APPROVED, approvedAt & approvedBy set
 * 4. User logs in -> login succeeds -> accesses authorized operational data
 * 5. Rejection flow: New user -> PENDING -> Admin rejects with reason -> login blocked with reason
 * 6. Security authorization: Non-admin calling admin endpoints -> strictly 403 Forbidden
 */

const BASE_URL = 'http://localhost:5000/api';

async function req(endpoint, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function runApprovalFlowVerification() {
  console.log('===============================================================');
  console.log('       MEDIROUTE ADMIN APPROVAL DASHBOARD FLOW VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, details = '') {
    if (condition) {
      passed++;
      console.log(`✓ PASS: ${title} ${details ? '— ' + details : ''}`);
    } else {
      failed++;
      console.error(`✗ FAIL: ${title} ${details ? '— ' + details : ''}`);
    }
  }

  // --- STEP 1: New user registers ---
  console.log('--- Step 1: New User Registration (Pending Status) ---');
  const timestamp = Date.now();
  const testUser = {
    name: 'Aravind Swamy',
    email: `aravind.${timestamp}@mediroute.in`,
    password: 'SecurePassword@123',
    role: 'transport_operator',
    phone: '+91 98200 44556',
  };

  const regRes = await req('/auth/register', {
    method: 'POST',
    body: testUser,
  });

  assert(
    'Registration returns 201 Created',
    regRes.status === 201
  );
  assert(
    'Account status is initialized as "pending"',
    regRes.data?.data?.user?.approvalStatus === 'pending'
  );
  assert(
    'No operational JWT token is issued upon pending registration',
    !regRes.data?.data?.token
  );

  const newUserId = regRes.data?.data?.user?.id || regRes.data?.data?.user?._id;

  // Pending user attempts to log in
  const pendingLogin = await req('/auth/login', {
    method: 'POST',
    body: { email: testUser.email, password: testUser.password },
  });

  assert(
    'Pending user login is blocked with 403 Forbidden',
    pendingLogin.status === 403
  );
  assert(
    'Pending login returns clear approval message',
    pendingLogin.data?.message?.includes('awaiting administrator approval'),
    `Msg: "${pendingLogin.data?.message}"`
  );

  // --- STEP 2: Admin logs in & views pending users ---
  console.log('\n--- Step 2: Admin Login & Directory Inspection ---');
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: { email: 'admin@mediroute.io', password: 'Admin@123456' },
  });

  const adminToken = adminLogin.data?.data?.token;
  assert('Admin signs in successfully', adminLogin.status === 200 && Boolean(adminToken));

  const pendingListRes = await req('/users/pending', { token: adminToken });
  assert('Admin retrieves pending users list (GET /api/users/pending)', pendingListRes.status === 200 && Array.isArray(pendingListRes.data?.data));

  const pendingUsers = pendingListRes.data?.data || [];
  const foundPending = pendingUsers.find(u => (u._id === newUserId || u.id === newUserId));
  assert(
    'Newly registered user appears in the pending users list',
    Boolean(foundPending),
    `Found: ${foundPending?.name} (${foundPending?.email})`
  );
  assert(
    'Pending record displays Name, Email, Phone, Requested Role, Registration Date, Status',
    Boolean(
      foundPending?.name &&
      foundPending?.email &&
      foundPending?.phone &&
      foundPending?.role &&
      foundPending?.createdAt &&
      foundPending?.approvalStatus === 'pending'
    )
  );

  // --- STEP 3: Admin approves user ---
  console.log('\n--- Step 3: Admin Approves User ---');
  const approveRes = await req(`/users/${newUserId}/approve`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'transport_operator' },
  });

  assert('Admin approval request succeeds (PATCH /api/users/:id/approve)', approveRes.status === 200);
  const approvedUserData = approveRes.data?.data;
  assert('User status updated to "approved"', approvedUserData?.approvalStatus === 'approved');
  assert('approvedAt timestamp is recorded', Boolean(approvedUserData?.approvedAt));
  assert('approvedBy administrator ID is recorded', Boolean(approvedUserData?.approvedBy));

  // Verify user is removed from pending list
  const pendingAfterApprove = await req('/users/pending', { token: adminToken });
  const stillPending = (pendingAfterApprove.data?.data || []).some(u => (u._id === newUserId || u.id === newUserId));
  assert('Approved user no longer appears in pending list', !stillPending);

  // --- STEP 4: Approved user logs in & accesses operational data ---
  console.log('\n--- Step 4: Approved User Login & Operational Access ---');
  const approvedLogin = await req('/auth/login', {
    method: 'POST',
    body: { email: testUser.email, password: testUser.password },
  });

  const userToken = approvedLogin.data?.data?.token;
  assert(
    'Approved user can now log in and receives JWT token',
    approvedLogin.status === 200 && Boolean(userToken)
  );
  assert(
    'Session payload confirms approvalStatus === "approved"',
    approvedLogin.data?.data?.user?.approvalStatus === 'approved'
  );

  // Access operational data
  const dispatchesRes = await req('/dispatches', { token: userToken });
  assert(
    'Approved user successfully accesses operational data (GET /api/dispatches)',
    dispatchesRes.status === 200 && Array.isArray(dispatchesRes.data?.data)
  );

  // --- STEP 5: Rejection Flow ---
  console.log('\n--- Step 5: Account Rejection Flow ---');
  const rejectUser = {
    name: 'Suresh Patil',
    email: `suresh.rejected.${timestamp}@mediroute.in`,
    password: 'SecurePassword@123',
    role: 'dispatcher',
    phone: '+91 98200 99887',
  };

  const regRejectRes = await req('/auth/register', {
    method: 'POST',
    body: rejectUser,
  });
  const rejectUserId = regRejectRes.data?.data?.user?.id || regRejectRes.data?.data?.user?._id;

  const rejectionReason = 'Incomplete credentials and failed emergency dispatch center validation.';
  const rejectRes = await req(`/users/${rejectUserId}/reject`, {
    method: 'PATCH',
    token: adminToken,
    body: { rejectionReason },
  });

  assert('Admin rejection succeeds (PATCH /api/users/:id/reject)', rejectRes.status === 200);
  const rejectedUserData = rejectRes.data?.data;
  assert('User status updated to "rejected"', rejectedUserData?.approvalStatus === 'rejected');
  assert('Rejection reason is stored in database', rejectedUserData?.rejectionReason === rejectionReason);

  // Attempt login with rejected user
  const rejectLogin = await req('/auth/login', {
    method: 'POST',
    body: { email: rejectUser.email, password: rejectUser.password },
  });

  assert('Rejected user login is blocked with 403 Forbidden', rejectLogin.status === 403);
  assert(
    'Rejection message and reason returned to user upon login attempt',
    rejectLogin.data?.message?.includes('rejected') && rejectLogin.data?.message?.includes(rejectionReason)
  );

  // --- STEP 6: Security & Role-Based Authorization Enforcement ---
  console.log('\n--- Step 6: Backend Security & Admin Authorization Checks ---');
  // Normal non-admin user (userToken from Step 4) attempts admin endpoints
  const nonAdminPending = await req('/users/pending', { token: userToken });
  assert('Non-admin user blocked from GET /api/users/pending (403 Forbidden)', nonAdminPending.status === 403);

  const nonAdminApprove = await req(`/users/${rejectUserId}/approve`, {
    method: 'PATCH',
    token: userToken,
    body: { role: 'dispatcher' },
  });
  assert('Non-admin user blocked from PATCH /api/users/:id/approve (403 Forbidden)', nonAdminApprove.status === 403);

  const nonAdminReject = await req(`/users/${newUserId}/reject`, {
    method: 'PATCH',
    token: userToken,
    body: { rejectionReason: 'Unauthorized test' },
  });
  assert('Non-admin user blocked from PATCH /api/users/:id/reject (403 Forbidden)', nonAdminReject.status === 403);

  const nonAdminRole = await req(`/users/${newUserId}/role`, {
    method: 'PATCH',
    token: userToken,
    body: { role: 'admin' },
  });
  assert('Non-admin user blocked from PATCH /api/users/:id/role (403 Forbidden)', nonAdminRole.status === 403);

  console.log('\n===============================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  if (failed === 0) {
    console.log('>>> COMPLETE ADMIN APPROVAL & REJECTION FLOW VERIFIED! <<<');
  } else {
    console.error(`>>> ${failed} CHECKS FAILED! <<<`);
    process.exit(1);
  }
}

runApprovalFlowVerification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
