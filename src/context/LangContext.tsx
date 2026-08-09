import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang } from './types'
import { dictionaries, type Dict } from '../i18n'
import { formatMoney } from '../utils/money'

type LangContextValue = {
  lang: Lang
  setLang: (l: Lang) => void
  t: Dict
  dir: 'ltr' | 'rtl'
  money: (n: number) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || 'fr'
  })

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('lang', l)
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: dictionaries[lang],
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      money: (n: number) => formatMoney(n, dictionaries[lang].currency),
    }),
    [lang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}
