// Returns basic order info for the scan confirmation screen.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const job_order_no = searchParams.get('job_order_no')

  if (!job_order_no) {
    return NextResponse.json({ error: 'job_order_no required' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('orders')
    .select('job_order_no, so_number, item_name, machine_code, length_m')
    .eq('job_order_no', job_order_no)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json({
    job_order_no: data.job_order_no,
    so_number:    data.so_number,
    item_name:    data.item_name,
    machine_code: data.machine_code,
    target_length: data.length_m,
  })
}
