import { NextResponse } from 'next/server'
import { getAllReminders } from '@/lib/direct-database'

export async function GET() {
  try {
    const reminders = await getAllReminders()
    return NextResponse.json(reminders)
  } catch (error) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json({ error: 'Error al obtener recordatorios' }, { status: 500 })
  }
}
