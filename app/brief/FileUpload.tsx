'use client'
import { useRef } from 'react'

interface FileUploadProps {
  files: File[]
  onChange: (files: File[]) => void
}

const ACCEPT = '.png,.jpg,.jpeg,.pdf,.ai,.svg,.mp4'

export default function FileUpload({ files, onChange }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      onChange([...files, ...newFiles])
    }
    // Reset input so same file can be re-added after removing
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-brand-border rounded-xl p-8 text-center cursor-pointer hover:border-brand-dark/40 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-3xl mb-2">&#8593;</div>
        <p className="text-sm font-medium text-brand-dark">Click to upload files</p>
        <p className="text-xs text-brand-muted mt-1">PNG, JPG, PDF, AI, SVG, MP4 — multiple allowed</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={handleChange}
          className="hidden"
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2.5">
              <span className="text-sm flex-1 truncate text-brand-dark">{file.name}</span>
              <span className="text-xs text-brand-muted flex-shrink-0">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-brand-muted hover:text-brand-dark text-lg leading-none flex-shrink-0"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
