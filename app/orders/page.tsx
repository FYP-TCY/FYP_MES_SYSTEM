import { supabase } from '@/lib/supabase'
import { Order } from '@/types/order'
import OrdersClient from './OrdersClient'

async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('seq_no', { ascending: true })
  if (error) { console.error(error); return [] }
  return data ?? []
}

export default async function OrdersPage() {
  const orders = await getOrders()
  return <OrdersClient orders={orders} />
}
