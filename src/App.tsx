import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, ChevronDown, Loader2, Search, Settings2, X } from 'lucide-react'
import clsx from 'clsx'

type PriceRow = { currency?: string; symbol?: string; price?: number | string }

type Token = {
  symbol: string
  price: number
  iconUrl: string
}

type Toast = { id: string; title: string; description?: string }

function formatUSD(n: number) {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function formatNum(n: number, max = 6) {
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: max }).format(n)
}

function safeParseNumber(v: string) {
  const cleaned = v.replace(/,/g, '').trim()
  if (cleaned === '') return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

function iconUrl(symbol: string) {
  return `https://raw.githubusercontent.com/Switcheo/token-icons/main/tokens/${encodeURIComponent(symbol)}.svg`
}

function pseudoBalance(symbol: string) {
  // deterministic "random" balances for a nicer demo
  let x = 0
  for (let i = 0; i < symbol.length; i++) x = (x * 31 + symbol.charCodeAt(i)) >>> 0
  const base = (x % 9500) / 100
  return Math.max(1, base)
}

function parsePrices(data: unknown): Token[] {
  const out: Token[] = []

  const push = (symRaw: unknown, priceRaw: unknown) => {
    const symbol = String(symRaw || '').trim()
    const price = typeof priceRaw === 'string' ? Number(priceRaw) : (priceRaw as number)
    if (!symbol || !Number.isFinite(price) || price <= 0) return
    out.push({ symbol, price, iconUrl: iconUrl(symbol) })
  }

  if (Array.isArray(data)) {
    for (const row of data as PriceRow[]) push(row.currency ?? row.symbol, row.price)
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (v && typeof v === 'object' && 'price' in (v as any)) push(k, (v as any).price)
      else push(k, v)
    }
  }

  // de-dupe & sort
  const map = new Map<string, Token>()
  for (const t of out) map.set(t.symbol.toUpperCase(), { ...t, symbol: t.symbol.toUpperCase() })
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
}

function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

function TokenAvatar({ token, size = 28 }: { token: Token; size?: number }) {
  const [ok, setOk] = useState(true)
  return (
    <div
      className="grid place-items-center rounded-full bg-white/10 ring-1 ring-white/10"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {ok ? (
        <img
          src={token.iconUrl}
          alt=""
          width={size - 8}
          height={size - 8}
          onError={() => setOk(false)}
          className="drop-shadow"
        />
      ) : (
        <span className="text-xs font-semibold text-white/70">{token.symbol.slice(0, 2)}</span>
      )}
    </div>
  )
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: any }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button className="absolute inset-0 bg-black/60 backdrop-blur" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-zinc-950/90 ring-1 ring-white/10 shadow-soft">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="text-sm font-semibold text-white/90">{title}</div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-300/40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="w-[320px] rounded-2xl bg-zinc-950/90 p-4 ring-1 ring-white/10 shadow-soft"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">{t.title}</div>
              {t.description && <div className="mt-1 text-xs text-white/70">{t.description}</div>}
            </div>
            <button
              className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [tokens, setTokens] = useState<Token[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tokenIn, setTokenIn] = useState<Token | null>(null)
  const [tokenOut, setTokenOut] = useState<Token | null>(null)
  const [amountInRaw, setAmountInRaw] = useState('')
  const amountIn = safeParseNumber(amountInRaw)
  const debouncedAmountIn = useDebounced(amountIn, 150)

  const [pickerOpen, setPickerOpen] = useState<null | 'in' | 'out'>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 80)

  const [slippageBps, setSlippageBps] = useState(50) // 0.50%
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (title: string, description?: string) => {
    const id = crypto.randomUUID()
    setToasts((p) => [{ id, title, description }, ...p].slice(0, 3))
    window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500)
  }

  // Load token prices
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadErr(null)
        const res = await fetch('https://interview.switcheo.com/prices.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const list = parsePrices(data)
        if (!list.length) throw new Error('No priced tokens found')
        if (cancelled) return
        setTokens(list)
        setTokenIn(list[0] ?? null)
        setTokenOut(list[1] ?? list[0] ?? null)
      } catch (e: any) {
        if (cancelled) return
        setLoadErr(e?.message ?? 'Failed to load prices')
        setTokens([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const balances = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tokens ?? []) m.set(t.symbol, pseudoBalance(t.symbol))
    return m
  }, [tokens])

  const priceIn = tokenIn?.price ?? NaN
  const priceOut = tokenOut?.price ?? NaN

  const rate = useMemo(() => {
    if (!Number.isFinite(priceIn) || !Number.isFinite(priceOut) || priceOut <= 0) return NaN
    return priceIn / priceOut
  }, [priceIn, priceOut])

  const amountOut = useMemo(() => {
    if (!Number.isFinite(rate) || !Number.isFinite(debouncedAmountIn)) return NaN
    if (debouncedAmountIn <= 0) return NaN
    return debouncedAmountIn * rate
  }, [rate, debouncedAmountIn])

  const minReceived = useMemo(() => {
    if (!Number.isFinite(amountOut)) return NaN
    return amountOut * (1 - slippageBps / 10000)
  }, [amountOut, slippageBps])

  const inputUSD = Number.isFinite(amountIn) && Number.isFinite(priceIn) ? amountIn * priceIn : NaN
  const outputUSD = Number.isFinite(amountOut) && Number.isFinite(priceOut) ? amountOut * priceOut : NaN

  const balanceIn = tokenIn ? balances.get(tokenIn.symbol) ?? 0 : 0

  const validation = useMemo(() => {
    if (!tokenIn || !tokenOut) return { ok: false, msg: 'Pick tokens' }
    if (tokenIn.symbol === tokenOut.symbol) return { ok: false, msg: 'Pick two different tokens' }
    if (!amountInRaw.trim()) return { ok: false, msg: 'Enter an amount' }
    if (!Number.isFinite(amountIn) || amountIn <= 0) return { ok: false, msg: 'Enter a valid amount' }
    if (amountIn > balanceIn) return { ok: false, msg: 'Insufficient balance' }
    if (!Number.isFinite(amountOut) || amountOut <= 0) return { ok: false, msg: 'Unable to quote price' }
    return { ok: true, msg: '' }
  }, [tokenIn, tokenOut, amountInRaw, amountIn, balanceIn, amountOut])

  const filteredTokens = useMemo(() => {
    const list = tokens ?? []
    const q = debouncedSearch.trim().toUpperCase()
    if (!q) return list
    return list.filter((t) => t.symbol.includes(q))
  }, [tokens, debouncedSearch])

  const onSwapSides = () => {
    const a = tokenIn
    const b = tokenOut
    setTokenIn(b)
    setTokenOut(a)
  }

  const onMax = () => {
    if (!tokenIn) return
    setAmountInRaw(String(Math.floor((balanceIn - 0.000001) * 1e6) / 1e6))
  }

  const onSubmit = async () => {
    if (!validation.ok || !tokenIn || !tokenOut) return
    setIsSubmitting(true)

    // Simulated backend latency
    await new Promise((r) => window.setTimeout(r, 1200))

    setIsSubmitting(false)
    addToast('Swap submitted', `${formatNum(amountIn, 6)} ${tokenIn.symbol} → ${formatNum(amountOut, 6)} ${tokenOut.symbol}`)
    setAmountInRaw('')
  }

  return (
    <div className="min-h-screen bg-[#070914] text-white">
      <div className="relative isolate overflow-hidden">
        <div className="glow" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(94,234,212,0.15),transparent_45%),radial-gradient(circle_at_80%_40%,rgba(99,102,241,0.12),transparent_50%)]" />

        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <ArrowDownUp className="h-5 w-5 text-teal-200" />
            </div>
            <div>
              <div className="text-sm font-semibold">Currency Swap</div>
              <div className="text-xs text-white/60">Token prices from prices.json • Icons from Switcheo repo</div>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-300/40"
          >
            <Settings2 className="h-4 w-4" />
            Settings
          </button>
        </header>

        <main className="mx-auto max-w-5xl px-5 pb-16">
          <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
            <section className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 shadow-soft backdrop-blur">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Swap tokens instantly</h1>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/70">
                    Choose two priced assets, enter an amount, and we’ll quote a live exchange rate. This UI mocks a backend
                    swap—complete with loading states, input validation, and a clean mobile-first layout.
                  </p>
                </div>
                <div className="hidden lg:block rounded-3xl bg-gradient-to-br from-teal-300/10 to-indigo-400/10 p-4 ring-1 ring-white/10">
                  <div className="text-xs text-white/70">Tip</div>
                  <div className="mt-1 text-sm text-white/90">Try searching tokens and hit “Max”.</div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl bg-black/30 p-4 ring-1 ring-white/10">
                {!tokens ? (
                  <div className="space-y-3">
                    <div className="h-6 w-40 rounded-lg bg-white/10 animate-shimmer bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.14),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
                    <div className="h-16 rounded-2xl bg-white/10 animate-shimmer bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.14),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
                    <div className="h-16 rounded-2xl bg-white/10 animate-shimmer bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.14),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
                  </div>
                ) : loadErr ? (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                    <div className="text-sm font-semibold text-rose-200">Couldn’t load token prices</div>
                    <div className="mt-1 text-xs text-rose-100/70">{loadErr}</div>
                    <div className="mt-3 text-xs text-white/60">Check your network and reload.</div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Swap</div>
                      <div className="text-xs text-white/60">Slippage: {formatNum(slippageBps / 100, 2)}%</div>
                    </div>

                    <div className="mt-3 space-y-3">
                      {/* From */}
                      <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-white/60">From</div>
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <span>Balance: {formatNum(balanceIn, 4)}</span>
                            <button
                              onClick={onMax}
                              className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-white/80 ring-1 ring-white/10 hover:bg-white/10"
                            >
                              Max
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex items-stretch gap-3">
                          <div className="flex-1">
                            <input
                              value={amountInRaw}
                              onChange={(e) => setAmountInRaw(e.target.value)}
                              inputMode="decimal"
                              placeholder="0.0"
                              className={clsx(
                                'w-full rounded-2xl bg-black/30 px-4 py-4 text-xl font-semibold tracking-tight outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-2',
                                validation.ok || !amountInRaw ? 'focus:ring-teal-300/40' : 'ring-rose-500/40 focus:ring-rose-400/40'
                              )}
                              aria-label="Amount in"
                            />
                            <div className="mt-1 text-xs text-white/60">≈ {formatUSD(inputUSD)}</div>
                          </div>

                          <button
                            onClick={() => {
                              setSearch('')
                              setPickerOpen('in')
                            }}
                            className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-3 ring-1 ring-white/10 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-teal-300/40"
                            aria-label="Select input token"
                          >
                            {tokenIn && <TokenAvatar token={tokenIn} />}
                            <span className="text-sm font-semibold">{tokenIn?.symbol ?? '—'}</span>
                            <ChevronDown className="h-4 w-4 text-white/60" />
                          </button>
                        </div>

                        {!validation.ok && amountInRaw && (
                          <div className="mt-2 text-xs text-rose-200">{validation.msg}</div>
                        )}
                      </div>

                      {/* Switch */}
                      <div className="grid place-items-center">
                        <button
                          onClick={onSwapSides}
                          className="group inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/80 ring-1 ring-white/10 hover:bg-white/10"
                        >
                          <ArrowDownUp className="h-4 w-4 transition-transform group-hover:rotate-180" />
                          Switch
                        </button>
                      </div>

                      {/* To */}
                      <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-white/60">To</div>
                          <div className="text-xs text-white/60">≈ {formatUSD(outputUSD)}</div>
                        </div>

                        <div className="mt-2 flex items-stretch gap-3">
                          <div className="flex-1">
                            <div className="w-full rounded-2xl bg-black/30 px-4 py-4 text-xl font-semibold tracking-tight ring-1 ring-white/10">
                              {Number.isFinite(amountOut) ? formatNum(amountOut, 6) : '—'}
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              Min received: {Number.isFinite(minReceived) ? `${formatNum(minReceived, 6)} ${tokenOut?.symbol}` : '—'}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSearch('')
                              setPickerOpen('out')
                            }}
                            className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-3 ring-1 ring-white/10 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-teal-300/40"
                            aria-label="Select output token"
                          >
                            {tokenOut && <TokenAvatar token={tokenOut} />}
                            <span className="text-sm font-semibold">{tokenOut?.symbol ?? '—'}</span>
                            <ChevronDown className="h-4 w-4 text-white/60" />
                          </button>
                        </div>
                      </div>

                      {/* Quote */}
                      <div className="rounded-3xl bg-black/30 p-4 ring-1 ring-white/10">
                        <div className="flex items-center justify-between text-xs text-white/70">
                          <span>Rate</span>
                          <span>
                            {Number.isFinite(rate) && tokenIn && tokenOut
                              ? `1 ${tokenIn.symbol} ≈ ${formatNum(rate, 6)} ${tokenOut.symbol}`
                              : '—'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                          <span>Network fee</span>
                          <span>~ {tokenIn ? formatNum(Math.max(0.001, tokenIn.price / 50000), 6) : '—'} {tokenIn?.symbol}</span>
                        </div>
                      </div>

                      <button
                        disabled={!validation.ok || isSubmitting}
                        onClick={onSubmit}
                        className={clsx(
                          'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-semibold shadow-soft transition',
                          validation.ok
                            ? 'bg-gradient-to-r from-teal-300/80 to-indigo-400/80 text-black hover:from-teal-300 hover:to-indigo-400'
                            : 'bg-white/10 text-white/50',
                          'focus:outline-none focus:ring-2 focus:ring-teal-300/40 disabled:cursor-not-allowed'
                        )}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          'Swap'
                        )}
                      </button>

                      <div className="text-center text-[11px] text-white/50">
                        This is a demo UI. Rates are derived from token prices and not executable trades.
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 shadow-soft">
                <div className="text-sm font-semibold">What’s included</div>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-200/70" /> Live price fetch with robust parsing.</li>
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-200/70" /> Searchable token picker with icons.</li>
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-200/70" /> Real-time quote, min-received via slippage.</li>
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-200/70" /> Validation + mocked balances + loading submit.</li>
                </ul>
              </div>

              <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 shadow-soft">
                <div className="text-sm font-semibold">Keyboard shortcuts</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
                  <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/10"><span className="text-white/90">Esc</span> closes dialogs</div>
                  <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/10"><span className="text-white/90">Tab</span> navigates controls</div>
                </div>
              </div>
            </aside>
          </div>
        </main>

        <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-white/40">
          Built with Vite + React + Tailwind.
        </footer>
      </div>

      {/* Token Picker */}
      <Modal
        open={pickerOpen !== null}
        onClose={() => setPickerOpen(null)}
        title={pickerOpen === 'in' ? 'Select token (From)' : 'Select token (To)'}
      >
        <div className="flex items-center gap-2 rounded-2xl bg-black/30 px-3 py-3 ring-1 ring-white/10">
          <Search className="h-4 w-4 text-white/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by symbol…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            autoFocus
          />
        </div>

        <div className="mt-4 max-h-[55vh] overflow-auto rounded-2xl ring-1 ring-white/10">
          {filteredTokens.length === 0 ? (
            <div className="p-4 text-sm text-white/70">No tokens found.</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {filteredTokens.map((t) => {
                const active = (pickerOpen === 'in' ? tokenIn?.symbol : tokenOut?.symbol) === t.symbol
                return (
                  <li key={t.symbol}>
                    <button
                      onClick={() => {
                        if (pickerOpen === 'in') setTokenIn(t)
                        else setTokenOut(t)
                        setPickerOpen(null)
                      }}
                      className={clsx(
                        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-teal-300/40',
                        active && 'bg-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <TokenAvatar token={t} size={30} />
                        <div>
                          <div className="text-sm font-semibold text-white">{t.symbol}</div>
                          <div className="text-xs text-white/60">{formatUSD(t.price)}</div>
                        </div>
                      </div>
                      <div className="text-xs text-white/60">Bal: {formatNum(balances.get(t.symbol) ?? 0, 4)}</div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Modal>

      {/* Settings */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Swap settings">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/70">Max slippage</label>
            <div className="mt-2 grid grid-cols-[1fr,110px] gap-3">
              <input
                type="range"
                min={0}
                max={200}
                value={slippageBps}
                onChange={(e) => setSlippageBps(Number(e.target.value))}
                className="w-full"
              />
              <div className="rounded-2xl bg-black/30 px-3 py-3 text-sm ring-1 ring-white/10">
                {formatNum(slippageBps / 100, 2)}%
              </div>
            </div>
            <div className="mt-2 text-xs text-white/60">Used only to compute “min received” for this demo.</div>
          </div>

          <button
            onClick={() => {
              setSettingsOpen(false)
              addToast('Settings saved', `Slippage set to ${formatNum(slippageBps / 100, 2)}%`)
            }}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-teal-300/40"
          >
            Save
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </div>
  )
}
