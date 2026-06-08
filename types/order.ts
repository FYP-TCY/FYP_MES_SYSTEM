  export interface Order {
    id: number
    seq_no: string
    date_no: string
    item_group_1: string
    item_group_2: string
    item_group_3: string
    job_order_no: string
    so_number: string
    machine_code: string
    progress_status: string
    priority: string
    delivery_date: string
    customer_name: string
    item_code: string
    item_name: string
    add_code_type: string
    length_m: number | null
    total_amount: number | null
    pcs: number | null
    total_kg: number | null
    special_packing: string
    salesman_name: string
    sales_co_name: string
    delivery_area: string
    delivery_state: string
    created_date: string
    created_by: string
    ready_for_machine: string
    status: string
    synced_at: string
  }