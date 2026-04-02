import path from 'path'
import fs from 'fs/promises'

const USE_S3 = !!(process.env.STORAGE_BUCKET && process.env.AWS_ACCESS_KEY_ID)

export async function saveFile(filename: string, buffer: Buffer): Promise<string> {
  if (USE_S3) {
    return saveToS3(filename, buffer)
  }
  return saveLocally(filename, buffer)
}

async function saveLocally(filename: string, buffer: Buffer): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, filename)
  await fs.writeFile(filePath, buffer)
  return `/uploads/${filename}`
}

async function saveToS3(filename: string, buffer: Buffer): Promise<string> {
  // Dynamic import to avoid breaking local builds without AWS SDK installed.
  // Install @aws-sdk/client-s3 when using S3 storage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awsModule = await import('@aws-sdk/client-s3' as any)
  const { S3Client, PutObjectCommand } = awsModule as {
    S3Client: new (config: Record<string, unknown>) => {
      send: (cmd: unknown) => Promise<unknown>
    }
    PutObjectCommand: new (input: Record<string, unknown>) => unknown
  }

  const client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  const bucket = process.env.STORAGE_BUCKET!
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `uploads/${filename}`,
      Body: buffer,
    })
  )

  const endpoint = process.env.AWS_ENDPOINT_URL
    ? `${process.env.AWS_ENDPOINT_URL}/${bucket}`
    : `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`

  return `${endpoint}/uploads/${filename}`
}
