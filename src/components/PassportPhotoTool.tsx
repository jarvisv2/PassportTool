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
const GAP_PX = Math.round(0.05 * DPI) // 15px gap (~0.05in) between photos for cutting

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

  // Apply background color to processed image and generate preview grid
  const applyColorAndPreview = useCallback(async () => {
    if (!processedDataUrl) return

    // Flatten: draw bg color + processed image onto canvas
    const img = new Image()
    img.onload = () => {
      // Flat single photo canvas
      const photoCanvas = document.createElement('canvas')
      photoCanvas.width = PHOTO_W_PX
      photoCanvas.height = PHOTO_H_PX
      const pCtx = photoCanvas.getContext('2d')!
      pCtx.fillStyle = bgColor
      pCtx.fillRect(0, 0, PHOTO_W_PX, PHOTO_H_PX)
      pCtx.drawImage(img, 0, 0, PHOTO_W_PX, PHOTO_H_PX)

      // Grid canvas: 4×6 inches at 300 DPI
      // Calculate margins to center the grid (accounting for gaps between photos)
      const totalPhotosW = COLS * PHOTO_W_PX + (COLS - 1) * GAP_PX
      const totalPhotosH = ROWS * PHOTO_H_PX + (ROWS - 1) * GAP_PX
      const marginX = Math.floor((PAGE_W_PX - totalPhotosW) / 2)
      const marginY = Math.floor((PAGE_H_PX - totalPhotosH) / 2)

      const gridCanvas = document.createElement('canvas')
      gridCanvas.width = PAGE_W_PX
      gridCanvas.height = PAGE_H_PX
      const gCtx = gridCanvas.getContext('2d')!
      gCtx.fillStyle = '#ffffff'
      gCtx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX)

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const x = marginX + col * (PHOTO_W_PX + GAP_PX)
          const y = marginY + row * (PHOTO_H_PX + GAP_PX)
          gCtx.drawImage(photoCanvas, x, y, PHOTO_W_PX, PHOTO_H_PX)
        }
      }

      setGridDataUrl(gridCanvas.toDataURL('image/jpeg', 0.95))
    }
    img.src = processedDataUrl
  }, [processedDataUrl, bgColor])

  useEffect(() => {
    if (step === 'preview') {
      applyColorAndPreview()
    }
  }, [step, applyColorAndPreview])

  // Also regenerate grid when bgColor changes in preview step
  useEffect(() => {
    if (step === 'preview') {
      applyColorAndPreview()
    }
  }, [bgColor]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-cyan-900">Passport Photo Tool | Ig @darkshadeoflove</h1>
            <p className="text-sm text-gray-500">Create professional passport photos in minutes</p>
          </div>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-1 shrink-0">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  idx === currentStepIdx
                    ? 'bg-blue-600 text-white'
                    : idx < currentStepIdx
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx < currentStepIdx ? 'bg-green-500 text-white' : idx === currentStepIdx ? 'bg-white text-blue-600' : 'bg-gray-300 text-gray-500'
                  }`}>
                    {idx < currentStepIdx ? '✓' : idx + 1}
                  </span>
                  {s.label}
                </div>
                {idx < steps.length - 1 && (
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* STEP: UPLOAD */}
        {step === 'upload' && (
          <div className="flex flex-col items-center justify-center">
            <div
              className="w-full max-w-lg border-2 border-dashed border-blue-300 rounded-2xl bg-white p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
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
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-700">Upload Your Photo</p>
                <p className="text-sm text-gray-400 mt-1">Click to browse or drag & drop</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP supported</p>
              </div>
              <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                Choose Photo
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="mt-8 grid grid-cols-3 gap-4 max-w-lg w-full text-center">
              {[
                { icon: '✂️', title: 'Precise Crop', desc: '1.1" × 1.35" passport size' },
                { icon: '🪄', title: 'AI Background Removal', desc: 'Automatic & instant' },
                { icon: '🖨️', title: '4×6 Print Grid', desc: '12 photos at 300 DPI' },
              ].map(f => (
                <div key={f.title} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <p className="text-sm font-semibold text-gray-700">{f.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP: CROP */}
        {step === 'crop' && srcUrl && (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm w-full max-w-2xl">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Crop Your Photo</h2>
              <p className="text-sm text-gray-500 mb-4">
                Adjust the crop box to frame your face. The ratio is fixed to passport size (1.1" × 1.35").
              </p>
              <div className="flex justify-center bg-gray-100 rounded-xl overflow-hidden">
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
                    style={{ maxHeight: '500px', maxWidth: '100%', display: 'block' }}
                    onLoad={onImageLoad}
                  />
                </ReactCrop>
              </div>
              <div className="mt-4 flex items-center gap-3 justify-end">
                <button
                  onClick={() => { setSrcUrl(null); setStep('upload') }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  ← Back
                </button>
                <button
                  onClick={handleCropConfirm}
                  disabled={!completedCrop}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Confirm Crop →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP: REMOVE BG */}
        {step === 'removebg' && croppedDataUrl && (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm w-full max-w-2xl">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Remove Background</h2>
              <p className="text-sm text-gray-500 mb-4">
                Use AI to automatically remove the background from your photo, or skip this step.
              </p>

              <div className="flex gap-6 justify-center flex-wrap">
                {/* Original */}
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Cropped Photo</p>
                  <div className="w-36 h-44 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                    <img src={croppedDataUrl} alt="Cropped" className="w-full h-full object-cover" />
                  </div>
                </div>
                {/* After BG removal */}
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">After Removal</p>
                  <div className="w-36 h-44 rounded-lg overflow-hidden border border-gray-200 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22%3E%3Crect width=%228%22 height=%228%22 fill=%22%23e5e7eb%22/%3E%3Crect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23e5e7eb%22/%3E%3C/svg%3E')]">
                    {bgRemoved && processedDataUrl ? (
                      <img src={processedDataUrl} alt="BG Removed" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-gray-400 text-xs text-center px-2">Remove BG to see preview</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 justify-between">
                <button
                  onClick={() => setStep('crop')}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  ← Back
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={skipBgRemoval}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                  >
                    Skip
                  </button>
                  {bgRemoved ? (
                    <button
                      onClick={proceedAfterBgRemoval}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Continue →
                    </button>
                  ) : (
                    <button
                      onClick={handleRemoveBg}
                      disabled={removingBg}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-75 transition-colors flex items-center gap-2"
                    >
                      {removingBg ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Removing...
                        </>
                      ) : (
                        '🪄 Remove Background'
                      )}
                    </button>
                  )}
                </div>
              </div>
              {removingBg && (
                <p className="text-xs text-gray-400 text-center mt-3">
                  Processing with AI... This may take a moment on first use while the model loads.
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP: BACKGROUND COLOR */}
        {step === 'bgcolor' && processedDataUrl && (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm w-full max-w-2xl">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Choose Background Color</h2>
              <p className="text-sm text-gray-500 mb-4">
                Select a background color to apply behind your photo. White is standard for most passport photos.
              </p>

              {/* Preview */}
              <div className="flex justify-center mb-5">
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Preview</p>
                  <div
                    className="w-36 h-44 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center"
                    style={{ backgroundColor: bgColor }}
                  >
                    <img
                      src={processedDataUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Preset Colors */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-600 mb-2">Preset Colors</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => { setBgColor(c.value); setCustomColor(c.value) }}
                      title={c.label}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all ${
                        bgColor === c.value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
                        style={{ backgroundColor: c.value }}
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Picker */}
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-gray-600">Custom:</p>
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
                  <input
                    type="color"
                    value={customColor}
                    onChange={e => { setCustomColor(e.target.value); setBgColor(e.target.value) }}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={customColor}
                    onChange={e => {
                      const val = e.target.value
                      setCustomColor(val)
                      if (/^#[0-9a-fA-F]{6}$/.test(val)) setBgColor(val)
                    }}
                    className="w-24 text-sm font-mono text-gray-700 outline-none"
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 justify-between">
                <button
                  onClick={() => setStep('removebg')}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep('preview')}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Preview Grid →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP: PREVIEW & DOWNLOAD */}
        {step === 'preview' && (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm w-full max-w-3xl">
              <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">4×6 Print Preview</h2>
                  <p className="text-sm text-gray-500">
                    12 passport photos (3×4) on a 4×6 inch page at 300 DPI
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('bgcolor')}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!gridDataUrl}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download 4×6 JPG
                  </button>
                </div>
              </div>

              {/* Grid Preview (scaled down for display) */}
              <div className="flex justify-center">
                {gridDataUrl ? (
                  <div className="border-2 border-gray-300 rounded overflow-hidden shadow-md">
                    <img
                      src={gridDataUrl}
                      alt="4x6 Passport Photo Grid"
                      style={{ width: '400px', height: '600px', display: 'block' }}
                    />
                  </div>
                ) : (
                  <div className="w-[400px] h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      <p className="text-sm">Generating grid...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Change BG color while in preview */}
              {gridDataUrl && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm font-medium text-gray-600 mb-2">Adjust Background Color</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => { setBgColor(c.value); setCustomColor(c.value) }}
                        title={c.label}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${bgColor === c.value ? 'border-blue-500 scale-110' : 'border-gray-300 hover:border-gray-500'}`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                    <input
                      type="color"
                      value={customColor}
                      onChange={e => { setCustomColor(e.target.value); setBgColor(e.target.value) }}
                      className="w-8 h-8 rounded-full cursor-pointer border-2 border-gray-300"
                      title="Custom color"
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Print tip:</strong> Download the image and print at a photo lab or home printer set to 4×6 inch format at actual size.
                  The image is {PAGE_W_PX}×{PAGE_H_PX} pixels ({DPI} DPI).
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
