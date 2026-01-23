const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjc5NjQzNzIsInNvdXJjZSI6InNyLWF1dGgtaWludCIsImV4cCI6MTc3MDAyOTIwNCwianRpIjoib3ZHYjFlWEJvR21sVzNnSiIsImlhdCI6MTc2OTE2NTIwNCwiaXNzIjoiaHR0cHM6Ly9zci1hdXRoLnNoaXByb2NrZXQuaW4vYXV0aG9yaXplL3VzZXIiLCJuYmYiOjE3NjkxNjUyMDQsImNpZCI6NDMxOTAyMiwidGMiOjM2MCwidmVyYm9zZSI6ZmFsc2UsInZlbmRvcl9pZCI6MCwidmVuZG9yX2NvZGUiOiIifQ.dJtucCXtwAATtO7_xQwUVnJR2ArjFXjNKtDseMhmqXg'

async function test() {
  const url = new URL('https://apiv2.shiprocket.in/v1/external/shipments')
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', '100')
  url.searchParams.set('from_date', '2025-09-01')
  
  const resp = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  
  const data = await resp.json()
  console.log('Keys:', Object.keys(data))
  console.log('Pagination:', data.pagination || data.meta)
  console.log('Count:', data.count)
  console.log('Data length:', (data.data || []).length)
}

test().catch(console.error)
