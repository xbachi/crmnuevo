'use client'

import { useState, useRef } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'

interface FileItem {
  id: string
  name: string
  type: 'mandato_gestoria' | 'contrato_parte2' | 'hoja_garantia' | 'otro'
  url: string
  uploadedAt: string
  size: number
}

interface FileManagerProps {
  dealId?: number // Opcional para archivos globales
  onFileUploaded?: (file: FileItem) => void
  onFileDeleted?: (fileId: string) => void
}

export default function FileManager({ dealId, onFileUploaded, onFileDeleted }: FileManagerProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [files, setFiles] = useState<FileItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fileTypes = [
    { value: 'mandato_gestoria', label: 'Mandato de Gestoría', color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { value: 'contrato_parte2', label: 'Contrato Parte 2', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { value: 'hoja_garantia', label: 'Hoja de Garantía', color: 'bg-green-50 border-green-200 text-green-700' },
    { value: 'otro', label: 'Otro Documento', color: 'bg-gray-50 border-gray-200 text-gray-700' }
  ]

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files)
    }
  }

  const handleFiles = async (fileList: FileList) => {
    const file = fileList[0]
    
    // Validar tipo de archivo
    if (file.type !== 'application/pdf') {
      showToast('Solo se permiten archivos PDF', 'error')
      return
    }

    // Validar tamaño (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('El archivo no puede ser mayor a 10MB', 'error')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // Usar endpoint diferente para archivos globales vs archivos de deal
      const endpoint = dealId ? '/api/deals/upload-file' : '/api/documentacion/upload-file'
      if (dealId) {
        formData.append('dealId', dealId.toString())
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const uploadedFile = await response.json()
        setFiles(prev => [...prev, uploadedFile])
        onFileUploaded?.(uploadedFile)
        showToast('Archivo subido correctamente', 'success')
      } else {
        const errorData = await response.json()
        showToast(`Error al subir archivo: ${errorData.error}`, 'error')
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      showToast('Error al subir el archivo', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/deals/files/${fileId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setFiles(prev => prev.filter(f => f.id !== fileId))
        onFileDeleted?.(fileId)
        showToast('Archivo eliminado correctamente', 'success')
      } else {
        showToast('Error al eliminar el archivo', 'error')
      }
    } catch (error) {
      console.error('Error deleting file:', error)
      showToast('Error al eliminar el archivo', 'error')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileTypeInfo = (type: string) => {
    return fileTypes.find(ft => ft.value === type) || fileTypes[3]
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Gestión de Archivos</h2>
      
      {/* Zona de subida */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="space-y-2">
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-sm text-gray-600">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Haz clic para subir
            </button>
            {' '}o arrastra y suelta un archivo PDF aquí
          </div>
          <p className="text-xs text-gray-500">Máximo 10MB por archivo</p>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Lista de archivos */}
      {files.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Archivos subidos</h3>
          <div className="space-y-2">
            {files.map((file) => {
              const typeInfo = getFileTypeInfo(file.type)
              return (
                <div key={file.id} className={`flex items-center justify-between p-3 rounded-lg border ${typeInfo.color}`}>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs opacity-75">
                        {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Descargar
                    </a>
                    <button
                      onClick={() => handleDeleteFile(file.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isUploading && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center space-x-2 text-sm text-gray-600">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Subiendo archivo...</span>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
