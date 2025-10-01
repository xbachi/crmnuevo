import { NextResponse } from 'next/server'
import { getDashboardReminders } from '@/lib/dashboard-reminders'

export async function GET() {
  try {
    const reminders = await getDashboardReminders()
    return NextResponse.json(reminders)
  } catch (error) {
    console.error('Error fetching dashboard reminders:', error)
    return NextResponse.json(
      { error: 'Error al obtener recordatorios del dashboard' },
      { status: 500 }
    )
  }
}
