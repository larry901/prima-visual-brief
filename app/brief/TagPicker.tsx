'use client'

interface TagPickerProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  multi?: boolean
}

export default function TagPicker({ options, selected, onChange, multi = true }: TagPickerProps) {
  const toggle = (option: string) => {
    if (multi) {
      if (selected.includes(option)) {
        onChange(selected.filter((s) => s !== option))
      } else {
        onChange([...selected, option])
      }
    } else {
      onChange(selected.includes(option) ? [] : [option])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              active
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'bg-gray-100 text-brand-dark border-transparent hover:border-brand-border'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
