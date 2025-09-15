'use client'

import { useState, useRef } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'

interface FileItem {
  id: number
  nombre: string
  url: string
  tipo: string
  fechaSubida: string
  descripcion?: string
}

interface InvestorFilesProps {
  inversorId: number
  files: FileItem[]
  canUpload: boolean // Si el usuario puede subir archivos
  onFileUploaded: () => void
}

export default function InvestorFiles({ inversorId, files, canUpload, onFileUploaded }: InvestorFilesProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadDescription, setUploadDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]

    if (!allowedTypes.includes(file.type)) {
      showToast('Tipo de archivo no permitido. Solo se permiten PDF, imágenes, Word y Excel', 'error')
      return
    }

    // Validar tamaño (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('El archivo es demasiado grande. Máximo 10MB', 'error')
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('inversorId', inversorId.toString())
      formData.append('descripcion', uploadDescription)

      const response = await fetch('/api/inversores/files/upload', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        showToast('Archivo subido correctamente', 'success')
        setUploadDescription('')
        onFileUploaded()
      } else {
        const error = await response.json()
        showToast(error.message || 'Error al subir archivo', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al subir archivo', 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDownload = async (fileId: number, fileName: string) => {
    try {
      const response = await fetch(`/api/inversores/files/${fileId}/download`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        showToast('Archivo descargado', 'success')
      } else {
        showToast('Error al descargar archivo', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al descargar archivo', 'error')
    }
  }

  const handleDelete = async (fileId: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) return

    try {
      const response = await fetch(`/api/inversores/files/${fileId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        showToast('Archivo eliminado correctamente', 'success')
        onFileUploaded()
      } else {
        showToast('Error al eliminar archivo', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al eliminar archivo', 'error')
    }
  }

  const getFileIcon = (tipo: string) => {
    if (tipo.includes('pdf')) {
      return (
        <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      )
    } else if (tipo.includes('image')) {
      return (
        <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      )
    } else if (tipo.includes('word') || tipo.includes('document')) {
      return (
        <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      )
    } else if (tipo.includes('excel') || tipo.includes('spreadsheet')) {
      return (
        <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      )
    }
    return (
      <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-gray-900">Archivos y Facturas</h3>
        {canUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Subiendo...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Subir Archivo</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Input oculto para seleccionar archivos */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Descripción del archivo (solo para usuarios con permisos) */}
      {canUpload && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descripción del archivo (opcional)
          </label>
          <input
            type="text"
            value={uploadDescription}
            onChange={(e) => setUploadDescription(e.target.value)}
            placeholder="Ej: Factura mecánica, Recibo de pintura, etc."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Lista de archivos */}
      <div className="space-y-3">
        {files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">No hay archivos subidos</p>
            <p className="text-sm">Los archivos aparecerán aquí una vez que se suban</p>
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <div className="flex items-center space-x-3 flex-1">
                {getFileIcon(file.tipo)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.nombre}</p>
                  {file.descripcion && (
                    <p className="text-xs text-gray-500 truncate">{file.descripcion}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    Subido el {new Date(file.fechaSubida).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownload(file.id, file.nombre)}
                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Descargar archivo"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                
                {canUpload && (
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Eliminar archivo"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <ToastContainer />
    </div>
  )
}
