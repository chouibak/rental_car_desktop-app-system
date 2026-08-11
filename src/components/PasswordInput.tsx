import { useState, type InputHTMLAttributes } from 'react'
import { useLang } from '../context/LangContext'
import { IconEye, IconEyeOff } from './icons'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function PasswordInput({ className = '', id, ...props }: PasswordInputProps) {
  const { t } = useLang()
  const [visible, setVisible] = useState(false)

  return (
    <div className="input-suffix-wrap password-input-wrap">
      <input
        {...props}
        id={id}
        className={`input input-with-suffix ${className}`.trim()}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? t.hidePassword : t.showPassword}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  )
}
