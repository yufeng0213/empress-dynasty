/**
 * 在浏览器里把整张立绘拼图切成单张。
 * 不依赖服务端图像库，切完直接得到 data URL，可上传或本地预览。
 */

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

const loadSource = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      }
    } catch (error) {
      // 某些浏览器对 HEIC 等格式不支持，退回到 <img>
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw new Error(`无法读取图片：${file.name}`)
  }
}

/**
 * @param {File} file
 * @param {{ rows: number, cols: number, maxWidth?: number, quality?: number, onProgress?: Function }} options
 */
export const splitSheet = async (file, options = {}) => {
  const rows = Math.max(1, Math.min(8, Number(options.rows) || 2))
  const cols = Math.max(1, Math.min(8, Number(options.cols) || 5))
  const maxWidth = Math.max(120, Number(options.maxWidth) || 720)
  const quality = Math.min(0.95, Math.max(0.6, Number(options.quality) || 0.9))
  const total = rows * cols

  if (total > 40) throw new Error('单张图最多切 40 格，请减少行列数')

  const { source, width, height, release } = await loadSource(file)
  const slices = []

  try {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sx = Math.round((col * width) / cols)
        const sy = Math.round((row * height) / rows)
        const sw = Math.round(((col + 1) * width) / cols) - sx
        const sh = Math.round(((row + 1) * height) / rows) - sy
        const scale = Math.min(1, maxWidth / sw)
        const dw = Math.max(1, Math.round(sw * scale))
        const dh = Math.max(1, Math.round(sh * scale))

        const canvas = document.createElement('canvas')
        canvas.width = dw
        canvas.height = dh
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh)

        slices.push({
          dataUrl: canvas.toDataURL('image/webp', quality),
          width: dw,
          height: dh,
          row,
          col,
        })

        options.onProgress?.(slices.length, total)
        if (slices.length % 4 === 0) await nextTick()
      }
    }
  } finally {
    release()
  }

  return slices
}

export const dataUrlBytes = (dataUrl) => {
  const base64 = String(dataUrl || '').split(',')[1] || ''
  return Math.round((base64.length * 3) / 4)
}
