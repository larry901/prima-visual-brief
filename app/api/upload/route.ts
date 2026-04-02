import { NextRequest, NextResponse } from 'next/server'
import { saveFile } from '@/lib/storage'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ paths: [] })
    }

    const paths: string[] = []

    for (const file of files) {
      const ext = path.extname(file.name)
      const filename = `${uuidv4()}${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())
      const filePath = await saveFile(filename, buffer)
      paths.push(filePath)
    }

    return NextResponse.json({ paths })
  } catch (err: unknown) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// App Router handles multipart/form-data natively — no bodyParser config needed.
// Raise the default 4 MB body limit so clients can upload larger files.
export const maxDuration = 60 // seconds (Vercel Pro/Enterprise; ignored on Hobby)

