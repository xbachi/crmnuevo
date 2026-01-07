import { getDriveId, graphRequest } from './msgraph'

export type DriveItem = {
  id: string
  name: string
  webUrl?: string
  parentReference?: {
    id?: string
    path?: string
  }
  folder?: {
    childCount?: number
  }
  file?: {
    mimeType?: string
  }
}

export async function getItemById(itemId: string): Promise<DriveItem> {
  const driveId = getDriveId()
  return graphRequest(`/drives/${driveId}/items/${encodeURIComponent(itemId)}`)
}

export async function getItemByPath(pathFromRoot: string): Promise<DriveItem> {
  const driveId = getDriveId()
  // Path must be relative to drive root
  const clean = pathFromRoot.startsWith('/') ? pathFromRoot : `/${pathFromRoot}`
  return graphRequest(`/drives/${driveId}/root:${clean}`)
}

export async function downloadItemContent(itemId: string): Promise<Buffer> {
  const driveId = getDriveId()
  return graphRequest(
    `/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`,
    {
      method: 'GET',
      isBinary: true,
    }
  )
}

export async function ensureFolderByPath(
  pathFromRoot: string
): Promise<DriveItem> {
  // mkdir -p by creating each segment
  const driveId = getDriveId()
  const clean = pathFromRoot.replace(/^\/+/, '')
  const parts = clean.split('/').filter(Boolean)

  let currentPath = ''
  let currentFolder: DriveItem | null = null

  for (const part of parts) {
    currentPath += `/${part}`
    try {
      currentFolder = await graphRequest<DriveItem>(
        `/drives/${driveId}/root:${currentPath}`
      )
    } catch (e: any) {
      // Create folder under parent
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || ''
      const parentItem =
        parentPath === ''
          ? await graphRequest<DriveItem>(`/drives/${driveId}/root`)
          : await graphRequest<DriveItem>(
              `/drives/${driveId}/root:${parentPath}`
            )

      const created = await graphRequest<DriveItem>(
        `/drives/${driveId}/items/${encodeURIComponent(parentItem.id)}/children`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: part,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename',
          }),
        }
      )
      currentFolder = created
    }
  }

  if (!currentFolder) {
    // root
    return graphRequest(`/drives/${driveId}/root`)
  }
  return currentFolder
}

export async function moveItemToFolder(
  itemId: string,
  destinationFolderId: string,
  newName?: string
): Promise<DriveItem> {
  const driveId = getDriveId()
  return graphRequest(
    `/drives/${driveId}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(newName ? { name: newName } : {}),
        parentReference: { id: destinationFolderId },
      }),
    }
  )
}

export async function uploadFileToPath(pathFromRoot: string, bytes: Buffer) {
  const driveId = getDriveId()
  const clean = pathFromRoot.startsWith('/') ? pathFromRoot : `/${pathFromRoot}`
  // conflictBehavior=rename avoids overwriting
  const urlPath = `/drives/${driveId}/root:${clean}:/content?@microsoft.graph.conflictBehavior=rename`
  return graphRequest<DriveItem>(urlPath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: bytes as any,
  })
}
