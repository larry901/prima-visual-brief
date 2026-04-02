'use client'
import { useState } from 'react'

interface InspirationLinksProps {
  links: string[]
  onChange: (links: string[]) => void
}

export default function InspirationLinks({ links, onChange }: InspirationLinksProps) {
  const [input, setInput] = useState('')

  const addLink = () => {
    const trimmed = input.trim()
    if (trimmed && !links.includes(trimmed)) {
      onChange([...links, trimmed])
      setInput('')
    }
  }

  const removeLink = (index: number) => {
    onChange(links.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLink()
            }
          }}
          placeholder="Paste a URL and press Enter or Add"
          className="input flex-1"
        />
        <button type="button" onClick={addLink} className="btn-secondary px-4 py-3 whitespace-nowrap">
          Add
        </button>
      </div>
      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((link, i) => (
            <li key={i} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="flex-1 truncate text-brand-dark">
                <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {link}
                </a>
              </span>
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="text-brand-muted hover:text-brand-dark ml-2 flex-shrink-0 text-lg leading-none"
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
