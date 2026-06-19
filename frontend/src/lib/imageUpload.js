const DEFAULT_QUALITY = 0.86

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this image. Try another JPG, PNG, or WebP file.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Could not optimize this image. Try another image file.'))
        }
      },
      type,
      quality,
    )
  })
}

export async function prepareImageUpload(
  file,
  {
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    quality = DEFAULT_QUALITY,
    outputName = file?.name || 'image.jpg',
  },
) {
  if (!file) return { file: null, previewUrl: '', warning: '' }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file.')
  }

  const image = await loadImage(file)
  if (image.naturalWidth < minWidth || image.naturalHeight < minHeight) {
    throw new Error(`Image is too low quality. Minimum size is ${minWidth} x ${minHeight}px.`)
  }

  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1)
  const targetWidth = Math.round(image.naturalWidth * scale)
  const targetHeight = Math.round(image.naturalHeight * scale)
  const shouldCompress = scale < 1 || file.size > 1_500_000

  if (!shouldCompress) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      warning: '',
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not optimize this image in this browser.')
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, outputType, quality)
  const optimizedFile = new File(
    [blob],
    outputName.replace(/\.[^.]+$/, outputType === 'image/png' ? '.png' : '.jpg'),
    {
      type: outputType,
    },
  )

  return {
    file: optimizedFile,
    previewUrl: URL.createObjectURL(optimizedFile),
    warning: `Image was optimized to ${targetWidth} x ${targetHeight}px for display.`,
  }
}
