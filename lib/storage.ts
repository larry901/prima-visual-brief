import path from 'path'
import fs from 'fs/promises'

export async function saveFile(filename: string, buffer: Buffer): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), buffer)
  return `/uploads/${filename}`
}
