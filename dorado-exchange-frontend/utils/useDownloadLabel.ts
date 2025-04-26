export function useDownloadBase64() {
  function base64ToBlob(base64: string, mime = 'application/pdf') {
    const cleanedBase64 = base64.split(',').pop() ?? ''
    const binary = atob(cleanedBase64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mime })
  }

  function downloadBase64(base64: string, filename: string, mime = 'application/pdf') {
    if (!base64) {
      console.error('No base64 data provided')
      return
    }

    const blob = base64ToBlob(base64, mime)
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()

    URL.revokeObjectURL(url)
  }

  return { downloadBase64 }
}
