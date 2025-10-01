'use client'

import { useState, useEffect, useRef } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import ProtectedRoute from '@/components/ProtectedRoute'

interface DocumentFile {
  id: string
  name: string
  type: 'mandato_gestoria' | 'contrato_parte2' | 'hoja_garantia'
  url: string
  uploadedAt: string
  size: number
}

export default function DocumentacionPage() {
  const { showToast, ToastContainer } = useSimpleToast()
  const [files, setFiles] = useState<DocumentFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})

  // Cargar archivos existentes al montar el componente
  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/documentacion/files')
      if (response.ok) {
        const data = await response.json()
        setFiles(data)
      }
    } catch (error) {
      console.error('Error loading files:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (file: File, type: string) => {
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

    setUploadingType(type)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type) // Especificar el tipo de documento

      const response = await fetch('/api/documentacion/upload-file', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const uploadedFile = await response.json()
        // Reemplazar archivo existente del mismo tipo o agregar nuevo
        setFiles((prev) => {
          const filtered = prev.filter((f) => f.type !== type)
          return [...filtered, uploadedFile]
        })
        showToast('Archivo subido correctamente', 'success')
      } else {
        const errorData = await response.json()
        showToast(`Error al subir archivo: ${errorData.error}`, 'error')
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      showToast('Error al subir el archivo', 'error')
    } finally {
      setUploadingType(null)
    }
  }

  const handleFileInput = (type: string) => {
    const input = fileInputRefs.current[type]
    if (input) {
      input.click()
    }
  }

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: string
  ) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file, type)
    }
    // Limpiar el input para permitir subir el mismo archivo otra vez
    e.target.value = ''
  }

  const handleDeleteFile = async (fileId: string) => {
    // Encontrar el archivo para verificar su tipo
    const fileToDelete = files.find((f) => f.id === fileId)

    // Proteger documentos importantes
    if (
      fileToDelete &&
      (fileToDelete.type === 'mandato_gestoria' ||
        fileToDelete.type === 'contrato_parte2')
    ) {
      showToast(
        'No se pueden eliminar documentos importantes como Mandato de Gestoría o Contrato Parte 2',
        'error'
      )
      return
    }

    try {
      const response = await fetch(`/api/documentacion/files/${fileId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId))
        showToast('Archivo eliminado correctamente', 'success')
      } else {
        showToast('Error al eliminar el archivo', 'error')
      }
    } catch (error) {
      console.error('Error deleting file:', error)
      showToast('Error al eliminar el archivo', 'error')
    }
  }

  const documentTypes = [
    {
      type: 'mandato_gestoria',
      label: 'Mandato de Gestoría',
      description: 'Documento para gestión de trámites',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      color: 'purple',
    },
    {
      type: 'contrato_parte2',
      label: 'Contrato Parte 2',
      description: 'Documento adicional del contrato',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      color: 'blue',
    },
    {
      type: 'hoja_garantia',
      label: 'Hoja de Garantía',
      description: 'Documento de garantía del vehículo',
      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      color: 'green',
    },
  ]

  const getFileForType = (type: string) => {
    return files.find((f) => f.type === type)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getColorClasses = (color: string) => {
    const colors = {
      purple: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        icon: 'text-purple-600',
        button: 'bg-purple-100 hover:bg-purple-200 text-purple-700',
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        icon: 'text-blue-600',
        button: 'bg-blue-100 hover:bg-blue-200 text-blue-700',
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        icon: 'text-green-600',
        button: 'bg-green-100 hover:bg-green-200 text-green-700',
      },
    }
    return colors[color as keyof typeof colors] || colors.blue
  }

  return (
    <ProtectedRoute>
      <div className="min-h-full bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Documentación</h1>
            <p className="mt-2 text-gray-600">
              Gestiona los documentos plantilla que se utilizan en todos los
              deals
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documentTypes.map((docType) => {
              const file = getFileForType(docType.type)
              const colors = getColorClasses(docType.color)
              const isUploading = uploadingType === docType.type

              return (
                <div
                  key={docType.type}
                  className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${colors.bg}`}
                >
                  <div className="flex items-center space-x-3 mb-4">
                    <div
                      className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center`}
                    >
                      <svg
                        className={`w-5 h-5 ${colors.icon}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={docType.icon}
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className={`font-semibold ${colors.text}`}>
                        {docType.label}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {docType.description}
                      </p>
                    </div>
                  </div>

                  {file ? (
                    <div className="space-y-3">
                      <div className={`p-3 rounded-lg border ${colors.border}`}>
                        <div className="flex items-center space-x-2 mb-2">
                          <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="text-sm font-medium">
                            {file.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)} •{' '}
                          {new Date(file.uploadedAt).toLocaleDateString(
                            'es-ES'
                          )}
                        </p>
                      </div>

                      <div className="flex space-x-2">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${colors.button} transition-colors`}
                        >
                          Ver
                        </a>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 mb-4">
                        No hay archivo subido
                      </p>
                      <button
                        onClick={() => handleFileInput(docType.type)}
                        disabled={isUploading}
                        className={`w-full px-4 py-2 text-sm font-medium rounded-md ${colors.button} transition-colors disabled:opacity-50`}
                      >
                        {isUploading ? 'Subiendo...' : 'Subir Archivo'}
                      </button>
                    </div>
                  )}

                  {/* Input oculto para cada tipo de documento */}
                  <input
                    ref={(el) => (fileInputRefs.current[docType.type] = el)}
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileChange(e, docType.type)}
                    className="hidden"
                  />
                </div>
              )
            })}
          </div>

          <ToastContainer />
        </div>
      </div>
    </ProtectedRoute>
  )
}
