import { useState, useRef, useCallback, useEffect } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

// Passport photo aspect ratio: 1.1in wide × 1.35in tall
const PASSPORT_ASPECT = 1.1 / 1.35

// 4×6 page at 300 DPI = 1200×1800 px
// 3 cols × 4 rows = 12 photos
// Each photo: 1.1in × 1.35in at 300 DPI = 330×405 px
// Margins: 0.1in = 30px on each side, gaps: 0.05in = 15px
const DPI = 300
const PAGE_W_IN = 4
const PAGE_H_IN = 6
const PHOTO_W_IN = 1.1
const PHOTO_H_IN = 1.35
const COLS = 3
const ROWS = 4

const PAGE_W_PX = PAGE_W_IN * DPI     // 1200
const PAGE_H_PX = PAGE_H_IN * DPI     // 1800
const PHOTO_W_PX = PHOTO_W_IN * DPI   // 330
const PHOTO_H_PX = PHOTO_H_IN * DPI   // 405
const GAP_PX = Math.round(0.10 * DPI) // 30px gap (~0.10in) between photos for cutting

type Step = 'upload' | 'crop' | 'removebg' | 'bgcolor' | 'preview'

const PRESET_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Off-White', value: '#f5f5f0' },
  { label: 'Light Blue', value: '#b0c4de' },
  { label: 'US Passport Blue', value: '#5b7fa6' },
  { label: 'Light Gray', value: '#e0e0e0' },
  { label: 'Red', value: '#cc0000' },
]

function getCroppedCanvas(image: HTMLImageElement, crop: PixelCrop): HTMLCanvasElement {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_W_PX
  canvas.height = PHOTO_H_PX
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    PHOTO_W_PX,
    PHOTO_H_PX,
  )
  return canvas
}

export default function PassportPhotoTool() {
  const [step, setStep] = useState<Step>('upload')
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>({ unit: '%', x: 10, y: 10, width: 80, height: 80 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [croppedDataUrl, setCroppedDataUrl] = useState<string | null>(null)
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [customColor, setCustomColor] = useState('#ffffff')
  const [removingBg, setRemovingBg] = useState(false)
  const [bgRemoved, setBgRemoved] = useState(false)
  const [gridDataUrl, setGridDataUrl] = useState<string | null>(null)

  const [photoCount, setPhotoCount] = useState<6 | 12>(12)
  const [borderWidth, setBorderWidth] = useState<number>(0)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // When image loads, set initial crop centered with correct aspect ratio
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    // Calculate initial crop: fit within the image maintaining passport ratio
    let cropW: number, cropH: number
    if (width / height > PASSPORT_ASPECT) {
      cropH = height * 0.9
      cropW = cropH * PASSPORT_ASPECT
    } else {
      cropW = width * 0.9
      cropH = cropW / PASSPORT_ASPECT
    }
    const x = (width - cropW) / 2
    const y = (height - cropH) / 2
    setCrop({ unit: 'px', x, y, width: cropW, height: cropH })
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setSrcUrl(reader.result as string)
      setStep('crop')
      setBgRemoved(false)
      setProcessedDataUrl(null)
      setGridDataUrl(null)
    }
    reader.readAsDataURL(file)
  }

  const handleCropConfirm = () => {
    if (!completedCrop || !imgRef.current) return
    const canvas = getCroppedCanvas(imgRef.current, completedCrop)
    setCroppedDataUrl(canvas.toDataURL('image/png'))
    setProcessedDataUrl(canvas.toDataURL('image/png'))
    setBgRemoved(false)
    setStep('removebg')
  }

  const handleRemoveBg = async () => {
    if (!croppedDataUrl) return
    setRemovingBg(true)
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const blob = await fetch(croppedDataUrl).then(r => r.blob())
      const resultBlob = await removeBackground(blob)
      const url = URL.createObjectURL(resultBlob)
      setProcessedDataUrl(url)
      setBgRemoved(true)
    } catch (err) {
      console.error('BG removal failed:', err)
      alert('Background removal failed. You can continue without it.')
    } finally {
      setRemovingBg(false)
    }
  }

  const skipBgRemoval = () => {
    setProcessedDataUrl(croppedDataUrl)
    setStep('bgcolor')
  }

  const proceedAfterBgRemoval = () => {
    setStep('bgcolor')
  }

  // Apply background color, borders, and generate preview grid
  const applyColorAndPreview = useCallback(async () => {
    if (!processedDataUrl) return

    const img = new Image()
    img.onload = () => {
      // Flat single photo canvas
      const photoCanvas = document.createElement('canvas')
      photoCanvas.width = PHOTO_W_PX
      photoCanvas.height = PHOTO_H_PX
      const pCtx = photoCanvas.getContext('2d')!
      
      // Draw background
      pCtx.fillStyle = bgColor
      pCtx.fillRect(0, 0, PHOTO_W_PX, PHOTO_H_PX)
      // Draw photo
      pCtx.drawImage(img, 0, 0, PHOTO_W_PX, PHOTO_H_PX)

      // Draw border if selected
      if (borderWidth > 0) {
        // Multiply by 3 so the border is visible on a high-res 300 DPI print
        pCtx.lineWidth = borderWidth * 3 
        pCtx.strokeStyle = '#000000' // CHANGED: Now uses a Solid Black cut-line
        // Offset by half line width so it doesn't clip off the edges
        const offset = pCtx.lineWidth / 2
        pCtx.strokeRect(offset, offset, PHOTO_W_PX - pCtx.lineWidth, PHOTO_H_PX - pCtx.lineWidth)
      }

      // Grid logic: Use 4 rows for 12 photos, or 2 rows for 6 photos
      const activeCols = 3
      const activeRows = photoCount === 12 ? 4 : 2

      const totalPhotosW = activeCols * PHOTO_W_PX + (activeCols - 1) * GAP_PX
      const totalPhotosH = activeRows * PHOTO_H_PX + (activeRows - 1) * GAP_PX
      const marginX = Math.floor((PAGE_W_PX - totalPhotosW) / 2)
      
      // CHANGED: If 12 photos, center vertically. If 6 photos, anchor to the top (using marginX for equal top padding).
      const marginY = photoCount === 12 ? Math.floor((PAGE_H_PX - totalPhotosH) / 2) : marginX

      const gridCanvas = document.createElement('canvas')
      gridCanvas.width = PAGE_W_PX
      gridCanvas.height = PAGE_H_PX
      const gCtx = gridCanvas.getContext('2d')!
      gCtx.fillStyle = '#ffffff'
      gCtx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX)

      for (let row = 0; row < activeRows; row++) {
        for (let col = 0; col < activeCols; col++) {
          const x = marginX + col * (PHOTO_W_PX + GAP_PX)
          const y = marginY + row * (PHOTO_H_PX + GAP_PX)
          gCtx.drawImage(photoCanvas, x, y, PHOTO_W_PX, PHOTO_H_PX)
        }
      }

      setGridDataUrl(gridCanvas.toDataURL('image/jpeg', 0.95))
    }
    img.src = processedDataUrl
  }, [processedDataUrl, bgColor, photoCount, borderWidth])

  useEffect(() => {
    if (step === 'preview') {
      applyColorAndPreview()
    }
  }, [step, applyColorAndPreview])

  // Also regenerate grid when settings change in preview step
  useEffect(() => {
    if (step === 'preview') {
      applyColorAndPreview()
    }
  }, [bgColor, photoCount, borderWidth]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = () => {
    if (!gridDataUrl) return
    const a = document.createElement('a')
    a.href = gridDataUrl
    a.download = 'passport-photos-4x6.jpg'
    a.click()
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'crop', label: 'Crop' },
    { id: 'removebg', label: 'Remove BG' },
    { id: 'bgcolor', label: 'Background' },
    { id: 'preview', label: 'Preview & Download' },
  ]

  const currentStepIdx = steps.findIndex(s => s.id === step)

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900 selection:bg-slate-900 selection:text-white">
      <style>{`
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes softPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(15, 23, 42, 0.06); }
          50% { box-shadow: 0 0 0 10px rgba(15, 23, 42, 0); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .passport-enter { animation: floatIn .45s ease-out both; }
        .passport-delay-1 { animation-delay: .06s; }
        .passport-delay-2 { animation-delay: .12s; }
        .passport-delay-3 { animation-delay: .18s; }
        .passport-pulse { animation: softPulse 2.4s ease-in-out infinite; }
        .passport-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,.55), rgba(255,255,255,.95), rgba(255,255,255,.55));
          background-size: 200% 100%;
          animation: shimmer 2.5s linear infinite;
        }
        .passport-glass {
          background: rgba(255,255,255,.82);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .passport-brand {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 35%, #ec4899 70%, #f97316 100%);
          box-shadow: 0 12px 28px -12px rgba(124,58,237,.65), 0 6px 18px -10px rgba(236,72,153,.45);
        }
        .passport-pro {
          border-color: rgba(139,92,246,.28);
          background: linear-gradient(90deg, rgba(99,102,241,.10), rgba(139,92,246,.12), rgba(236,72,153,.12), rgba(249,115,22,.10));
          color: #7c3aed;
        }
        .passport-active {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 45%, #db2777 100%) !important;
          box-shadow: 0 12px 28px -12px rgba(124,58,237,.65);
        }
        .passport-active > span:first-child { color: #4f46e5 !important; }
        .passport-hero-gradient {
          background: linear-gradient(90deg, #4f46e5, #7c3aed 35%, #ec4899 70%, #f97316);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent !important;
        }
        .passport-upload-card {
          border-color: rgba(139,92,246,.25);
          box-shadow: 0 30px 80px -35px rgba(79,70,229,.28), 0 24px 60px -40px rgba(236,72,153,.25);
        }
        .passport-upload-inner {
          background: radial-gradient(circle at 10% 10%, rgba(99,102,241,.11), transparent 30%), radial-gradient(circle at 90% 85%, rgba(236,72,153,.11), transparent 32%), radial-gradient(circle at 50% 100%, rgba(249,115,22,.07), transparent 28%), #fbfbff;
          border-color: rgba(139,92,246,.30);
        }
        .passport-icon-gradient {
          background: linear-gradient(135deg, #4338ca, #7c3aed 45%, #db2777);
          box-shadow: 0 16px 32px -14px rgba(124,58,237,.75);
        }
        .passport-cta {
          background: linear-gradient(135deg, #4f46e5, #7c3aed 45%, #db2777) !important;
          box-shadow: 0 14px 30px -14px rgba(124,58,237,.75) !important;
        }
        .passport-cta:hover {
          background: linear-gradient(135deg, #4338ca, #6d28d9 45%, #be185d) !important;
        }
        .passport-step-line {
          background: linear-gradient(90deg, rgba(99,102,241,.40), rgba(236,72,153,.40)) !important;
        }
        .passport-feature {
          position: relative;
          overflow: hidden;
          transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
        }
        .passport-feature::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #4f46e5, #7c3aed, #ec4899, #f97316);
        }
        .passport-feature:hover {
          transform: translateY(-4px);
          border-color: rgba(139,92,246,.30);
          box-shadow: 0 20px 40px -25px rgba(79,70,229,.45);
        }
        .passport-social {
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }
        .passport-social:hover {
          transform: translateY(-2px);
        }
        .passport-instagram {
          border-color: rgba(236,72,153,.25) !important;
          background: linear-gradient(135deg, rgba(245,158,11,.08), rgba(236,72,153,.10), rgba(124,58,237,.08)) !important;
        }
        .passport-instagram:hover {
          border-color: rgba(236,72,153,.45) !important;
          box-shadow: 0 12px 30px -18px rgba(236,72,153,.55);
        }
        .passport-instagram svg { color: #e1306c; }
        .passport-github {
          border-color: rgba(79,70,229,.22) !important;
          background: linear-gradient(135deg, rgba(79,70,229,.08), rgba(139,92,246,.08)) !important;
        }
        .passport-github:hover {
          border-color: rgba(124,58,237,.40) !important;
          box-shadow: 0 12px 30px -18px rgba(79,70,229,.45);
        }
        .passport-github svg { color: #6d28d9; }
      `}</style>

      {/* Premium header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 passport-glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="passport-brand w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0m6 0a3 3 0 11-6 0m12 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-semibold tracking-tight text-slate-950">
                  Passport Photo Studio
                </h1>
                <span className="passport-pro hidden sm:inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]">
                  PRO TOOL
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Create print-ready passport photos in minutes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://instagram.com/darkshadeoflove"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram @darkshadeoflove"
              className="passport-social passport-instagram group inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.1" stroke="currentColor" strokeWidth="1.7"/>
                <circle cx="12" cy="12" r="4.05" stroke="currentColor" strokeWidth="1.7"/>
                <circle cx="17.35" cy="6.8" r="1" fill="currentColor"/>
              </svg>
              <span className="hidden sm:inline">@darkshadeoflove</span>
              <span className="sm:hidden">Instagram</span>
            </a>
            <a
              href="https://github.com/jarvisv2"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub @jarvisv2"
              className="passport-social passport-github group inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .7a11.3 11.3 0 00-3.57 22.02c.57.1.78-.25.78-.55v-2.05c-3.18.7-3.85-1.53-3.85-1.53-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.33.95.1-.74.4-1.25.73-1.54-2.54-.29-5.2-1.27-5.2-5.64 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.13 1.17a10.9 10.9 0 015.7 0c2.17-1.48 3.13-1.17 3.13-1.17.62 1.57.23 2.73.11 3.02.73.8 1.18 1.82 1.18 3.07 0 4.38-2.67 5.34-5.21 5.63.41.36.78 1.07.78 2.16v3.21c0 .3.21.65.79.54A11.3 11.3 0 0012 .7z"/>
              </svg>
              <span className="hidden sm:inline">@jarvisv2</span>
              <span className="sm:hidden">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-slate-200 bg-white/75">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-center overflow-x-auto">
            {steps.map((s, idx) => {
              const done = idx < currentStepIdx
              const active = idx === currentStepIdx
              return (
                <div key={s.id} className="flex items-center shrink-0">
                  <div className={`flex items-center gap-2 rounded-full px-2.5 sm:px-3.5 py-2 transition-all ${
                    active
                      ? 'passport-active text-white shadow-md'
                      : done
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-transparent text-slate-400'
                  }`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? 'bg-white text-slate-950'
                        : done
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-400'
                    }`}>
                      {done ? '✓' : idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-medium">{s.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <span className="passport-step-line mx-1.5 sm:mx-2 h-px w-4 sm:w-8 bg-slate-200" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* STEP: UPLOAD */}
        {step === 'upload' && (
          <div className="passport-enter flex flex-col items-center">
            <div className="w-full max-w-3xl mb-8 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Studio workflow
              </span>
              <h2 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-slate-950">
                Turn one photo into
                <span className="passport-hero-gradient block">print-ready passport sheets.</span>
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-7 text-slate-500">
                Crop precisely, remove the background, pick a clean color, then export a 300 DPI 4×6 sheet.
              </p>
            </div>

            <div
              className="passport-upload-card group w-full max-w-3xl rounded-[28px] border bg-white p-2 cursor-pointer transition-all hover:-translate-y-1 passport-delay-1"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = () => {
                    setSrcUrl(reader.result as string)
                    setStep('crop')
                  }
                  reader.readAsDataURL(file)
                }
              }}
            >
              <div className="passport-upload-inner rounded-[22px] border border-dashed px-6 sm:px-12 py-12 sm:py-16 text-center transition-colors">
                <div className="passport-icon-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg passport-pulse">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
                      d="M4 16.2l4.6-4.6a2 2 0 012.8 0l2.2 2.2 1.6-1.6a2 2 0 012.8 0l1.9 1.9M6 20h12a2 2 0 002-2V7.8a2 2 0 00-2-2H6a2 2 0 00-2 2V18a2 2 0 002 2zM8.5 9.3h.01"/>
                  </svg>
                </div>
                <h3 className="mt-6 text-lg sm:text-xl font-semibold tracking-tight text-slate-950">
                  Drop your photo here
                </h3>
                <p className="mt-1.5 text-sm text-slate-500">
                  Or click to browse from your device
                </p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-500 shadow-sm">
                  JPG · PNG · WEBP
                </div>
                <div className="mt-7">
                  <button className="passport-cta inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5">
                    Choose Photo
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
              {[
                { step: '01', title: 'Precise crop', desc: 'Fixed 1.1″ × 1.35″ ratio' },
                { step: '02', title: 'Clean background', desc: 'AI removal, when needed' },
                { step: '03', title: 'Print sheet', desc: '4×6 at 300 DPI' },
              ].map((f, i) => (
                <div key={f.title} className={`passport-feature passport-enter passport-delay-${i + 1} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
                  <div className="text-[10px] font-bold tracking-[0.2em] text-slate-400">{f.step}</div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{f.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP: CROP */}
        {step === 'crop' && srcUrl && (
          <div className="passport-enter flex flex-col items-center gap-6">
            <div className="w-full max-w-4xl">
              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Step 02</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950">Frame your photo</h2>
                <p className="mt-1.5 text-sm text-slate-500">The crop ratio is locked to 1.1″ × 1.35″ for consistent passport sizing.</p>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-3 sm:p-5 shadow-[0_18px_55px_-30px_rgba(15,23,42,.25)]">
                <div className="rounded-[20px] bg-[#eef0f3] p-2 sm:p-4 flex justify-center overflow-hidden">
                  <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={c => setCompletedCrop(c)}
                    aspect={PASSPORT_ASPECT}
                    minWidth={50}
                    keepSelection
                  >
                    <img
                      ref={imgRef}
                      src={srcUrl}
                      alt="Upload"
                      style={{ maxHeight: '500px', maxWidth: '100%', display: 'block', borderRadius: '14px' }}
                      onLoad={onImageLoad}
                    />
                  </ReactCrop>
                </div>

                <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Drag the frame to position your face
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => { setSrcUrl(null); setStep('upload') }}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCropConfirm}
                      disabled={!completedCrop}
                      className="px-5 py-2.5 rounded-xl bg-slate-950 text-white text-sm font-semibold shadow-lg shadow-slate-950/15 transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirm crop
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP: REMOVE BG */}
        {step === 'removebg' && croppedDataUrl && (
          <div className="passport-enter flex flex-col items-center gap-6">
            <div className="w-full max-w-4xl">
              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Step 03</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950">Clean the background</h2>
                <p className="mt-1.5 text-sm text-slate-500">Use local AI background removal, or skip this step when your photo is already clean.</p>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-7 shadow-[0_18px_55px_-30px_rgba(15,23,42,.25)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Original crop</p>
                    <div className="aspect-[1.1/1.35] w-full max-w-[230px] mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <img src={croppedDataUrl} alt="Cropped" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Processed</p>
                    <div className="aspect-[1.1/1.35] w-full max-w-[230px] mx-auto overflow-hidden rounded-xl border border-slate-200 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22%3E%3Crect width=%228%22 height=%228%22 fill=%22%23eef0f3%22/%3E%3Crect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23dfe3e8%22/%3E%3C/svg%3E')]">
                      {bgRemoved && processedDataUrl ? (
                        <img src={processedDataUrl} alt="BG Removed" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-center px-6">
                          <span className="text-xs leading-5 text-slate-400">Remove the background to preview the result.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-7 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <button
                    onClick={() => setStep('crop')}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                  >
                    Back
                  </button>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={skipBgRemoval}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                      Skip
                    </button>
                    {bgRemoved ? (
                      <button
                        onClick={proceedAfterBgRemoval}
                        className="passport-cta px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:-translate-y-0.5"
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        onClick={handleRemoveBg}
                        disabled={removingBg}
                        className="passport-cta px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-70 flex items-center justify-center gap-2"
                      >
                        {removingBg ? (
                          <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Processing…
                          </>
                        ) : (
                          <>
                            <span>✦</span> Remove background
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {removingBg && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                    <p className="text-xs text-slate-500">Processing with AI… first use may take a moment while the model loads.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP: BACKGROUND COLOR */}
        {step === 'bgcolor' && processedDataUrl && (
          <div className="passport-enter flex flex-col items-center gap-6">
            <div className="w-full max-w-4xl">
              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Step 04</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950">Choose the finish</h2>
                <p className="mt-1.5 text-sm text-slate-500">Pick a background color. White remains the standard choice for most passport uses.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
                <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-7 shadow-[0_18px_55px_-30px_rgba(15,23,42,.25)] flex items-center justify-center min-h-[460px]">
                  <div className="text-center">
                    <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Live preview</p>
                    <div
                      className="mx-auto w-48 sm:w-56 aspect-[1.1/1.35] rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-slate-900/10 flex items-center justify-center"
                      style={{ backgroundColor: bgColor }}
                    >
                      <img src={processedDataUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: bgColor, boxShadow: 'inset 0 0 0 1px rgba(15,23,42,.18)' }} />
                      {bgColor}
                    </div>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6 shadow-[0_18px_55px_-30px_rgba(15,23,42,.25)]">
                  <p className="text-sm font-semibold text-slate-950">Preset colors</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Choose a clean preset or enter your own HEX value.</p>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => { setBgColor(c.value); setCustomColor(c.value) }}
                        title={c.label}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-all ${
                          bgColor === c.value
                            ? 'border-slate-950 bg-slate-50 ring-2 ring-slate-950/10'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: c.value }} />
                        <span className="truncate text-slate-700">{c.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="my-6 h-px bg-slate-100" />

                  <label className="block text-xs font-semibold text-slate-700">Custom HEX</label>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <input
                      type="color"
                      value={customColor}
                      onChange={e => { setCustomColor(e.target.value); setBgColor(e.target.value) }}
                      className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={customColor}
                      onChange={e => {
                        const val = e.target.value
                        setCustomColor(val)
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) setBgColor(val)
                      }}
                      className="w-full bg-transparent px-1 text-sm font-mono text-slate-700 outline-none"
                      placeholder="#ffffff"
                    />
                  </div>

                  <div className="mt-7 flex items-center gap-2">
                    <button
                      onClick={() => setStep('removebg')}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep('preview')}
                      className="passport-cta flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:-translate-y-0.5"
                    >
                      Preview sheet
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP: PREVIEW & DOWNLOAD */}
        {step === 'preview' && (
          <div className="passport-enter flex flex-col items-center gap-6">
            <div className="w-full">
              <div className="mb-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Step 05</p>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950">Preview & export</h2>
                  <p className="mt-1.5 text-sm text-slate-500">Your 4×6 sheet is rendered at 300 DPI and ready for printing.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep('bgcolor')}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!gridDataUrl}
                    className="passport-cta px-4 sm:px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Download JPG
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
                <div className="rounded-[26px] border border-slate-200 bg-white p-4 sm:p-6 shadow-[0_18px_55px_-30px_rgba(15,23,42,.25)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Print sheet</p>
                      <p className="text-xs text-slate-500 mt-0.5">4 × 6 in · 300 DPI</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {photoCount} photos
                    </span>
                  </div>

                  <div className="rounded-2xl bg-[#eef0f3] p-3 sm:p-5 flex justify-center overflow-auto">
                    {gridDataUrl ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_20px_45px_-24px_rgba(15,23,42,.38)]">
                        <img
                          src={gridDataUrl}
                          alt="4x6 Passport Photo Grid"
                          style={{ width: '400px', height: '600px', display: 'block' }}
                        />
                      </div>
                    ) : (
                      <div className="w-[400px] h-[600px] bg-white border border-slate-200 rounded-xl flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <svg className="animate-spin w-7 h-7" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          <p className="text-xs font-medium">Generating high-res grid…</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {gridDataUrl && (
                    <>
                      <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Layout</p>
                            <p className="mt-1 text-xs text-slate-500">How many copies should be placed on the sheet?</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className={`cursor-pointer rounded-xl border p-3 transition-all ${
                            photoCount === 6 ? 'border-slate-950 bg-slate-50 ring-2 ring-slate-950/10' : 'border-slate-200 hover:bg-slate-50'
                          }`}>
                            <input type="radio" checked={photoCount === 6} onChange={() => setPhotoCount(6)} className="sr-only" />
                            <span className="block text-sm font-semibold text-slate-900">6 photos</span>
                            <span className="block mt-1 text-[11px] text-slate-500">Half page</span>
                          </label>
                          <label className={`cursor-pointer rounded-xl border p-3 transition-all ${
                            photoCount === 12 ? 'border-slate-950 bg-slate-50 ring-2 ring-slate-950/10' : 'border-slate-200 hover:bg-slate-50'
                          }`}>
                            <input type="radio" checked={photoCount === 12} onChange={() => setPhotoCount(12)} className="sr-only" />
                            <span className="block text-sm font-semibold text-slate-900">12 photos</span>
                            <span className="block mt-1 text-[11px] text-slate-500">Full page</span>
                          </label>
                        </div>

                        <div className="mt-5 pt-5 border-t border-slate-100">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Cut-line stroke</p>
                              <p className="mt-1 text-xs text-slate-500">Adds a border for easier trimming.</p>
                            </div>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{borderWidth}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="5"
                            step="1"
                            value={borderWidth}
                            onChange={(e) => setBorderWidth(Number(e.target.value))}
                            className="mt-4 w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-950"
                          />
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-slate-950">Background</p>
                        <p className="mt-1 text-xs text-slate-500">Change the sheet color instantly.</p>
                        <div className="mt-4 flex flex-wrap gap-2 items-center">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c.value}
                              onClick={() => { setBgColor(c.value); setCustomColor(c.value) }}
                              title={c.label}
                              className={`w-9 h-9 rounded-full border-2 transition-all ${
                                bgColor === c.value
                                  ? 'border-slate-950 scale-110 ring-2 ring-slate-950/10'
                                  : 'border-slate-200 hover:border-slate-400'
                              }`}
                              style={{ backgroundColor: c.value }}
                            />
                          ))}
                          <div className="w-px h-7 bg-slate-200 mx-0.5" />
                          <input
                            type="color"
                            value={customColor}
                            onChange={e => { setCustomColor(e.target.value); setBgColor(e.target.value) }}
                            className="w-9 h-9 rounded-full cursor-pointer border-2 border-slate-200 shadow-sm"
                            title="Custom color"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-5 text-white shadow-lg shadow-slate-950/10">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3h12M6 21h12M8 3v3a4 4 0 004 4 4 4 0 004-4V3M8 21v-3a4 4 0 014-4 4 4 0 014 4v3"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Print tip</p>
                        <p className="mt-1.5 text-xs leading-5 text-slate-300">
                          Print the downloaded JPG at 4×6 inches, Actual Size / 100%, with no scaling.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-white p-4 text-center shadow-sm">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-400">Built by</p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <a href="https://instagram.com/darkshadeoflove" target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors">
                        @darkshadeoflove
                      </a>
                      <span className="text-slate-300">·</span>
                      <a href="https://github.com/jarvisv2" target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors">
                        @jarvisv2
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Passport Photo Studio</span>
          <span>Designed for a clean, distraction-free workflow.</span>
        </div>
      </footer>
    </div>
  )
}
