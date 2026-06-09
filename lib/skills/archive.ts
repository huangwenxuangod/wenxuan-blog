import type { SkillArchiveEntry } from './types'

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024
const MAX_FILES = 100
const MAX_FILE_BYTES = 2 * 1024 * 1024

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const minimumOffset = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50
      && bytes[offset + 1] === 0x4b
      && bytes[offset + 2] === 0x05
      && bytes[offset + 3] === 0x06
    ) {
      return offset
    }
  }
  return -1
}

function normalizeArchivePath(rawPath: string) {
  const path = rawPath.replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (
    !path
    || path.startsWith('/')
    || /^[a-zA-Z]:\//.test(path)
    || path.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`ZIP 包含不安全路径：${rawPath}`)
  }
  return path
}

async function inflateRaw(bytes: Uint8Array) {
  const format = 'deflate-raw' as CompressionFormat
  const buffer = bytes.slice().buffer as ArrayBuffer
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function extractSkillArchive(buffer: ArrayBuffer): Promise<SkillArchiveEntry[]> {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('Skill ZIP 必须小于 5MB')
  }

  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const endOffset = findEndOfCentralDirectory(bytes)
  if (endOffset < 0) throw new Error('无效的 ZIP 文件')

  const fileCount = view.getUint16(endOffset + 10, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  if (fileCount < 1 || fileCount > MAX_FILES) {
    throw new Error(`Skill ZIP 文件数量必须在 1-${MAX_FILES} 之间`)
  }

  const decoder = new TextDecoder()
  const entries: SkillArchiveEntry[] = []
  let totalUncompressed = 0
  let offset = centralOffset

  for (let index = 0; index < fileCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('ZIP 中央目录损坏')
    }

    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const rawPath = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength

    if (flags & 0x1) throw new Error('不支持加密 ZIP')
    if (rawPath.endsWith('/')) continue
    if (method !== 0 && method !== 8) throw new Error(`不支持 ZIP 压缩方式：${method}`)
    if (uncompressedSize > MAX_FILE_BYTES) throw new Error(`Skill 单文件不能超过 2MB：${rawPath}`)

    const path = normalizeArchivePath(rawPath)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize)
    const content = method === 0 ? compressed : await inflateRaw(compressed)

    if (content.byteLength !== uncompressedSize) {
      throw new Error(`ZIP 文件大小校验失败：${path}`)
    }

    totalUncompressed += content.byteLength
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('Skill 解压后总大小不能超过 10MB')
    }
    entries.push({ path, bytes: content })
  }

  return entries
}

export function resolveSkillRoot(entries: SkillArchiveEntry[]) {
  const skillFiles = entries.filter((entry) => entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md'))
  if (skillFiles.length !== 1) {
    throw new Error('Skill ZIP 必须且只能包含一个 SKILL.md')
  }

  const skillPath = skillFiles[0].path
  const root = skillPath === 'SKILL.md' ? '' : skillPath.slice(0, -'/SKILL.md'.length)
  const rootPrefix = root ? `${root}/` : ''
  const files = entries
    .filter((entry) => !rootPrefix || entry.path.startsWith(rootPrefix))
    .map((entry) => ({
      path: rootPrefix ? entry.path.slice(rootPrefix.length) : entry.path,
      bytes: entry.bytes,
    }))

  if (files.length !== entries.length) {
    throw new Error('Skill ZIP 只能包含一个 Skill 根目录')
  }

  return {
    rootName: root,
    skillMd: files.find((entry) => entry.path === 'SKILL.md')!,
    files,
  }
}
